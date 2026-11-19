"""DryRun's tracer: runs a user's Python under sys.settrace and records every step.

Pure standard library, so the same file runs in Pyodide (in the browser's Web Worker) and
under CPython (pytest on CI). The output is JSON-ready:

- steps: one per line, call, return or exception event in the user's code, each with the
  line, the frame's call id, the locals that changed, the heap objects that changed, the
  stdout length, and what the line is about to read, write or call on a data structure.
- calls: one per function frame, with arguments, parent, depth, return value and the steps
  it spans: the recursion tree.
- heap objects carry stable ids, so two names bound to one list point at one id.

Every limit is enforced here and reported in `capped`: the browser never receives an
unbounded trace. An infinite loop hits the step cap; one that swallows the cap's exception
is caught by the worker's wall-clock watchdog, which terminates the worker.
"""

import ast
import builtins
import collections
import io
import json
import sys
import time
import traceback
import types

USER_FILE = "<dryrun>"
CALL_FILE = "<dryrun-call>"
VERSION = 1

DEFAULT_LIMITS = {
    "max_steps": 5000,  # events recorded before the run is stopped
    "max_depth": 200,  # user call frames on the stack at once
    "max_calls": 5000,  # function calls recorded
    "max_objects": 200,  # heap objects expanded per snapshot
    "max_items": 120,  # items shown per container (the rest is counted, not sent)
    "max_str": 200,  # characters kept of a long string
    "max_bytes": 6_000_000,  # serialized trace size
    "max_seconds": 8.0,  # wall clock inside the tracer
    "max_stdout": 100_000,  # characters of output kept
}

PROGRESS_EVERY = 250  # steps between progress reports, so a watchdog knows where a run got to
CO_OPTIMIZED = 0x0001  # set on function code objects, not on module or class bodies
STRUCT_METHODS = frozenset(
    "append pop popleft appendleft extend insert remove add discard get setdefault update clear sort reverse".split()
)
HEAPQ_FUNCS = frozenset("heappush heappop heapify heappushpop heapreplace".split())
SAFE_BINOPS = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.FloorDiv: lambda a, b: a // b,
    ast.Mod: lambda a, b: a % b,
}
INDEXABLE = (list, tuple, str)
DICTS = (dict, collections.defaultdict, collections.Counter, collections.OrderedDict)


class TraceCapped(BaseException):
    """Raised from the trace function to stop the user's program at a limit."""


class _Missing(Exception):
    """An expression the access analysis can't (or won't) evaluate safely."""


# ---------------------------------------------------------------------------------------
# Static analysis: what each line reads, writes and calls, found once from the AST.
# ---------------------------------------------------------------------------------------


def _header_nodes(stmt):
    """The parts of a statement that run on its own line (not its nested body)."""
    if isinstance(stmt, (ast.If, ast.While)):
        return [stmt.test]
    if isinstance(stmt, (ast.For, ast.AsyncFor)):
        return [stmt.target, stmt.iter]
    if isinstance(stmt, (ast.With, ast.AsyncWith)):
        return [item.context_expr for item in stmt.items]
    if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Try)):
        return []
    if hasattr(ast, "TryStar") and isinstance(stmt, ast.TryStar):
        return []
    if isinstance(stmt, ast.Match):
        return [stmt.subject]
    return [stmt]


def _index_name(node):
    """The pointer an index is: `i`, or `j-1` for `b[j - 1]` (the arrow goes where the read is)."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub)):
        if isinstance(node.left, ast.Name) and isinstance(node.right, ast.Constant) and type(node.right.value) is int:
            sign = "+" if isinstance(node.op, ast.Add) else "-"
            return f"{node.left.id}{sign}{node.right.value}"
    return None


def analyse(tree):
    """Maps line -> {"subs": [(node, kind)], "attrs": [(node, kind)], "ops": [(target, method)], "ins": [expr]}."""
    lines = {}
    for stmt in ast.walk(tree):
        if not isinstance(stmt, ast.stmt):
            continue
        info = lines.setdefault(stmt.lineno, {"subs": [], "attrs": [], "ops": [], "ins": []})
        aug_target = stmt.target if isinstance(stmt, ast.AugAssign) else None
        for header in _header_nodes(stmt):
            # In dp[i][j], dp[i] only fetches a row: the access is (row, j), recorded once.
            row_fetches = {id(n.value) for n in ast.walk(header) if isinstance(n, ast.Subscript)}
            methods = {id(n.func) for n in ast.walk(header) if isinstance(n, ast.Call)}
            for node in ast.walk(header):
                if isinstance(node, ast.Subscript) and id(node) not in row_fetches and not isinstance(node.slice, ast.Slice):
                    if node is aug_target:
                        info["subs"].append((node, "rw"))
                    elif isinstance(node.ctx, ast.Load):
                        info["subs"].append((node, "r"))
                    else:
                        info["subs"].append((node, "w"))
                elif isinstance(node, ast.Attribute) and id(node) not in methods:
                    if node is aug_target:
                        info["attrs"].append((node, "rw"))
                    else:
                        info["attrs"].append((node, "r" if isinstance(node.ctx, ast.Load) else "w"))
                if isinstance(node, ast.Call):
                    func = node.func
                    if isinstance(func, ast.Attribute):
                        if isinstance(func.value, ast.Name) and func.value.id == "heapq" and func.attr in HEAPQ_FUNCS:
                            if node.args:
                                info["ops"].append((node.args[0], func.attr))
                        elif func.attr in STRUCT_METHODS:
                            info["ops"].append((func.value, func.attr))
                    elif isinstance(func, ast.Name) and func.id in HEAPQ_FUNCS and node.args:
                        info["ops"].append((node.args[0], func.id))
                elif isinstance(node, ast.Compare):
                    for op, right in zip(node.ops, node.comparators):
                        if isinstance(op, (ast.In, ast.NotIn)):
                            info["ins"].append(right)
    return lines


# ---------------------------------------------------------------------------------------
# The tracer.
# ---------------------------------------------------------------------------------------


class Tracer:
    def __init__(self, limits=None, record=True, progress=None):
        self.progress = progress  # called as progress(steps, line) every PROGRESS_EVERY steps
        self.limits = dict(DEFAULT_LIMITS)
        self.limits.update(limits or {})
        self.record = record
        self.steps = []
        self.step_count = 0
        self.size = 0
        self.calls = []
        self.stack = []  # [(frame, call_id)]
        self.line_hits = {}
        self.max_depth = 0
        self.capped = None
        self.ids = {}  # id(obj) -> heap id
        self.keep = []  # keeps every referenced object alive, so ids are never reused
        self.last_obj = {}  # heap id -> last emitted JSON
        self.last_locals = {}  # call id (or "g") -> last emitted JSON
        self.lines = {}
        self.started = 0.0
        self.stdout = None
        self.last_exc = {}  # call id -> step of an exception not yet followed by a line

    # -- values ------------------------------------------------------------------------

    def ref(self, obj):
        key = id(obj)
        n = self.ids.get(key)
        if n is None:
            n = len(self.keep) + 1
            self.ids[key] = n
            self.keep.append(obj)
        return n

    def enc(self, x, queue):
        """A JSON value for x: primitives inline, everything else {"r": heap id}."""
        t = type(x)
        if x is None or t is bool:
            return x
        if t is int:
            if -(2**53) < x < 2**53:
                return x
            try:
                return {"int": str(x)}
            except ValueError:  # beyond Python's int-to-str digit limit
                return {"int": "huge"}
        if t is float:
            return {"f": repr(x)}
        if t is str:
            limit = self.limits["max_str"]
            return x if len(x) <= limit else {"str": x[:limit], "len": len(x)}
        if isinstance(x, (types.ModuleType, types.BuiltinFunctionType)):
            return {"repr": f"<{t.__name__} {getattr(x, '__name__', '')}>"}
        n = self.ref(x)
        if queue is not None:
            queue.append((n, x))
        return {"r": n}

    def expand(self, x, queue):
        """The heap entry for a container or instance. Never runs user code."""
        t = type(x)
        cap = self.limits["max_items"]

        def seq(items, total):
            out = {"v": [self.enc(v, queue) for v in items]}
            if total > cap:
                out["n"] = total
            return out

        if t is list:
            return {"t": "list", **seq(list.__getitem__(x, slice(0, cap)), len(x))}
        if isinstance(x, tuple):
            out = {"t": "tuple", **seq(tuple.__getitem__(x, slice(0, cap)), len(x))}
            fields = getattr(t, "_fields", None)
            if t is not tuple:
                out["cls"] = t.__name__
                if isinstance(fields, tuple):
                    out["fields"] = [str(f) for f in fields]
            return out
        if t is collections.deque:
            items = []
            for i, v in enumerate(x):
                if i >= cap:
                    break
                items.append(v)
            return {"t": "deque", **seq(items, len(x))}
        if t in (set, frozenset):
            items = list(x)
            if all(type(v) in (int, str, float) for v in items):
                try:
                    items.sort()
                except TypeError:
                    pass
            return {"t": t.__name__, **seq(items[:cap], len(items))}
        if isinstance(x, dict) and (t is dict or t.__module__ == "collections"):
            entries = []
            for i, (k, v) in enumerate(dict.items(x)):
                if i >= cap:
                    break
                entries.append([self.enc(k, queue), self.enc(v, queue)])
            out = {"t": "dict", "v": entries}
            if len(x) > cap:
                out["n"] = len(x)
            if t is not dict:
                out["cls"] = t.__name__
            return out
        if isinstance(x, types.FunctionType):
            return {"t": "fn", "name": x.__name__}
        if isinstance(x, type):
            return {"t": "class", "name": x.__name__}
        attrs = self.attrs(x)
        if attrs is not None:
            return {"t": "obj", "cls": t.__name__, "v": {k: self.enc(v, queue) for k, v in attrs}}
        if t.__module__ == "builtins":
            try:
                text = repr(x)
            except Exception:  # noqa: BLE001 - a builtin's repr can still fail
                text = f"<{t.__name__}>"
            return {"t": "other", "cls": t.__name__, "repr": text[: self.limits["max_str"]]}
        return {"t": "other", "cls": t.__name__, "repr": f"<{t.__name__} object>"}

    def attrs(self, x):
        """An instance's attributes from __dict__ and __slots__, without calling user code."""
        out = []
        try:
            d = object.__getattribute__(x, "__dict__")
        except Exception:  # noqa: BLE001 - no __dict__, or a hostile __getattribute__
            d = None
        if isinstance(d, dict):
            out.extend((k, v) for k, v in dict.items(d) if isinstance(k, str) and not k.startswith("__"))
        for klass in type(x).__mro__:
            for name in klass.__dict__.get("__slots__", ()):
                if isinstance(name, str) and not name.startswith("__"):
                    try:
                        out.append((name, object.__getattribute__(x, name)))
                    except Exception:  # noqa: BLE001 - an unset slot
                        pass
        if d is None and not out:
            return None
        return out[: self.limits["max_items"]]

    # -- snapshots ---------------------------------------------------------------------

    def frame_locals(self, frame):
        return {k: v for k, v in frame.f_locals.items() if not k.startswith((".", "__"))}

    def user_globals(self, g):
        out = {}
        for k, v in g.items():
            if k.startswith("__") or isinstance(v, (types.ModuleType, types.BuiltinFunctionType)):
                continue
            if isinstance(v, types.FunctionType) or isinstance(v, type):
                continue  # definitions, not data; the recursion tree names them
            out[k] = v
        return out

    def snapshot(self, step, g, result=None):
        """Adds changed locals ("v"), globals ("g") and heap objects ("h") to the step."""
        queue = collections.deque()
        changed = {}
        if result is not None:
            step["result"] = self.enc(result[0], queue)
        # Current frame first, so its objects get the budget before callers' do.
        for frame, cid in reversed(self.stack):
            if frame.f_code.co_flags & CO_OPTIMIZED:
                enc = {k: self.enc(v, queue) for k, v in self.frame_locals(frame).items()}
                text = json.dumps(enc, separators=(",", ":"))
                if self.last_locals.get(cid) != text:
                    self.last_locals[cid] = text
                    changed[str(cid)] = enc
        if changed:
            step["v"] = changed
        enc = {k: self.enc(v, queue) for k, v in self.user_globals(g).items()}
        text = json.dumps(enc, separators=(",", ":"))
        if self.last_locals.get("g") != text:
            self.last_locals["g"] = text
            step["g"] = enc

        heap = {}
        seen = set()
        expanded = 0
        while queue:
            n, x = queue.popleft()
            if n in seen:
                continue
            seen.add(n)
            if expanded >= self.limits["max_objects"]:
                if n not in self.last_obj:
                    self.last_obj[n] = '{"t":"more"}'
                    heap[str(n)] = {"t": "more"}
                continue
            expanded += 1
            obj = self.expand(x, queue)
            text = json.dumps(obj, separators=(",", ":"))
            if self.last_obj.get(n) != text:
                self.last_obj[n] = text
                heap[str(n)] = obj
        if heap:
            step["h"] = heap

    # -- access analysis ----------------------------------------------------------------

    def value_of(self, node, frame):
        """Evaluates a small, side-effect-free expression in the frame, or raises _Missing."""
        if isinstance(node, ast.Name):
            f_locals = frame.f_locals
            if node.id in f_locals:
                return f_locals[node.id]
            if node.id in frame.f_globals:
                return frame.f_globals[node.id]
            raise _Missing
        if isinstance(node, ast.Constant) and type(node.value) in (int, str, bool):
            return node.value
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            v = self.value_of(node.operand, frame)
            if type(v) is not int:
                raise _Missing
            return -v
        if isinstance(node, ast.BinOp) and type(node.op) in SAFE_BINOPS:
            a, b = self.value_of(node.left, frame), self.value_of(node.right, frame)
            if type(a) is not int or type(b) is not int or (type(node.op) in (ast.FloorDiv, ast.Mod) and b == 0):
                raise _Missing
            return SAFE_BINOPS[type(node.op)](a, b)
        if isinstance(node, ast.Tuple):
            return tuple(self.value_of(e, frame) for e in node.elts)
        if isinstance(node, ast.Subscript):
            base = self.value_of(node.value, frame)
            key = self.value_of(node.slice, frame)
            return self.index(base, key)
        if isinstance(node, ast.Attribute):
            base = self.value_of(node.value, frame)
            try:
                d = object.__getattribute__(base, "__dict__")
            except Exception:  # noqa: BLE001
                raise _Missing from None
            if isinstance(d, dict) and node.attr in d:
                return d[node.attr]
            raise _Missing
        raise _Missing

    def index(self, base, key):
        """base[key] for builtin containers only; a defaultdict is read without inserting."""
        if type(base) in INDEXABLE and type(key) is int:
            if -len(base) <= key < len(base):
                return base[key]
            raise _Missing
        if type(base) in DICTS:
            try:
                if dict.__contains__(base, key):
                    return dict.__getitem__(base, key)
            except TypeError:  # unhashable key
                pass
        raise _Missing

    def accesses(self, frame, step):
        info = self.lines.get(frame.f_lineno)
        if not info:
            return
        reads, writes, pointers, ops = [], [], [], []
        for node, kind in info["subs"]:
            try:
                base = self.value_of(node.value, frame)
            except _Missing:
                continue
            index_var = _index_name(node.slice)
            base_name = node.value.id if isinstance(node.value, ast.Name) else None
            if index_var is not None and type(base) in (list, tuple, str, collections.deque):
                pointers.append([self.ref(base) if type(base) is not str else None, base_name, index_var])
            if type(base) is str:
                continue
            try:
                key = self.value_of(node.slice, frame)
                key_enc = self.enc(key, None)
            except _Missing:
                continue
            if type(base) in (list, tuple) or type(base) in DICTS:
                entry = [self.ref(base), key_enc]
                if "r" in kind:
                    reads.append(entry)
                if "w" in kind:
                    writes.append(entry)
        attr_reads, attr_writes = [], []
        for node, kind in info["attrs"]:
            try:
                base = self.value_of(node.value, frame)
                d = object.__getattribute__(base, "__dict__")
            except Exception:  # noqa: BLE001 - not an instance with a __dict__
                continue
            if isinstance(d, dict) and not isinstance(base, (type, types.ModuleType, types.FunctionType)):
                entry = [self.ref(base), node.attr]
                if "r" in kind:
                    attr_reads.append(entry)
                if "w" in kind:
                    attr_writes.append(entry)
        if attr_reads:
            step["ar"] = attr_reads
        if attr_writes:
            step["aw"] = attr_writes
        for target, method in info["ops"]:
            try:
                obj = self.value_of(target, frame)
            except _Missing:
                continue
            if type(obj) in (list, collections.deque, set) or type(obj) in DICTS:
                ops.append([self.ref(obj), method])
        for target in info["ins"]:
            try:
                obj = self.value_of(target, frame)
            except _Missing:
                continue
            if type(obj) in (list, set, frozenset, collections.deque) or type(obj) in DICTS:
                ops.append([self.ref(obj), "in"])
        if reads:
            step["rd"] = reads
        if writes:
            step["wr"] = writes
        if pointers:
            step["px"] = pointers
        if ops:
            step["ops"] = ops

    # -- events ------------------------------------------------------------------------

    def cap(self, reason, line):
        self.capped = {"reason": reason, "step": self.step_count, "line": line}
        raise TraceCapped(reason)

    def add_step(self, event, frame, cid, extra=None):
        line = frame.f_lineno
        if self.step_count >= self.limits["max_steps"]:
            self.cap("steps", line)
        if time.monotonic() - self.started > self.limits["max_seconds"]:
            self.cap("time", line)
        self.step_count += 1
        if self.progress is not None and self.step_count % PROGRESS_EVERY == 0:
            self.progress(self.step_count, line)
        if event == "l":
            self.line_hits[line] = self.line_hits.get(line, 0) + 1
        if not self.record:
            return
        step = {"e": event, "ln": line, "c": cid}
        if extra:
            step.update(extra)
        if event == "l":
            self.accesses(frame, step)
        self.snapshot(step, frame.f_globals)
        out_len = len(self.stdout.getvalue())
        step["o"] = out_len
        self.size += len(json.dumps(step, separators=(",", ":"))) + 1
        self.steps.append(step)
        if self.size > self.limits["max_bytes"]:
            self.steps.pop()
            self.step_count -= 1
            self.cap("size", line)

    def trace(self, frame, event, arg):
        if frame.f_code.co_filename != USER_FILE or self.capped is not None:
            return None
        if event == "call":
            parent = self.stack[-1][1] if self.stack else None
            code = frame.f_code
            is_fn = bool(code.co_flags & CO_OPTIMIZED)
            depth = sum(1 for f, _ in self.stack if f.f_code.co_flags & CO_OPTIMIZED) + (1 if is_fn else 0)
            if depth > self.limits["max_depth"]:
                self.cap("depth", frame.f_lineno)
            if len(self.calls) >= self.limits["max_calls"]:
                self.cap("calls", frame.f_lineno)
            self.max_depth = max(self.max_depth, depth)
            cid = len(self.calls)
            call = {"fn": code.co_name, "p": parent, "d": depth, "s": self.step_count}
            if not is_fn:
                call["kind"] = "module" if code.co_name == "<module>" else "class"
            elif self.record:
                nargs = code.co_argcount + code.co_kwonlyargcount
                nargs += bool(code.co_flags & 0x04) + bool(code.co_flags & 0x08)  # *args, **kwargs
                f_locals = frame.f_locals
                call["args"] = {
                    name: self.enc(f_locals[name], None) for name in code.co_varnames[:nargs] if name in f_locals
                }
            self.calls.append(call)
            self.stack.append((frame, cid))
            self.add_step("c", frame, cid)
            return self.trace
        cid = self.stack[-1][1] if self.stack else -1
        if event == "line":
            self.last_exc.pop(cid, None)
            self.add_step("l", frame, cid)
        elif event == "exception":
            exc_type, exc, _ = arg
            if exc_type is TraceCapped:
                return self.trace
            self.last_exc[cid] = True
            self.add_step("x", frame, cid, {"x": f"{exc_type.__name__}: {exc}"[: self.limits["max_str"]]})
        elif event == "return":
            call = self.calls[cid]
            call["e"] = self.step_count
            if self.last_exc.pop(cid, None):
                call["raised"] = True
                self.add_step("r", frame, cid, {"raised": True})
            else:
                if self.record:
                    call["r"] = self.enc(arg, None)
                self.add_step("r", frame, cid, {"r": call.get("r")})
            if self.stack and self.stack[-1][0] is frame:
                self.stack.pop()
        return self.trace

    # -- the run -------------------------------------------------------------------------

    def run(self, code, stdin="", call=None):
        result = {"version": VERSION, "limits": self.limits}
        try:
            tree = ast.parse(code, USER_FILE)
            compiled = compile(tree, USER_FILE, "exec")
            call_code = compile(call, CALL_FILE, "eval") if call else None
        except SyntaxError as e:
            where = "call" if e.filename == CALL_FILE else "code"
            result.update(steps=[], calls=[], stdout="", counts=self.counts())
            result["error"] = {
                "type": "SyntaxError",
                "msg": e.msg,
                "line": e.lineno if where == "code" else None,
                "where": where,
                "tb": f"SyntaxError: {e.msg} (line {e.lineno})",
            }
            return result
        self.lines = analyse(tree)
        g = {"__name__": "dryrun" if call else "__main__", "__builtins__": builtins}
        self.stdout = io.StringIO()
        saved = sys.stdin, sys.stdout, sys.stderr, sys.getrecursionlimit()
        sys.stdin = io.StringIO(stdin)
        sys.stdout = sys.stderr = self.stdout
        sys.setrecursionlimit(max(saved[3], self.limits["max_depth"] + 100))
        self.started = time.monotonic()
        error = None
        value = None
        sys.settrace(self.trace)
        try:
            exec(compiled, g)
            if call_code is not None:
                value = eval(call_code, g)
        except TraceCapped:
            pass
        except BaseException as e:  # noqa: BLE001 - the user's error is part of the result
            error = self.describe(e, code)
        finally:
            sys.settrace(None)
            sys.stdin, sys.stdout, sys.stderr = saved[:3]
            sys.setrecursionlimit(saved[3])
        if error is None and self.capped is None and call_code is not None:
            # The returned value, its objects expanded even if nothing in the trace held them.
            final = {}
            self.snapshot(final, g, (value,))
            result["result"] = final.pop("result")
            result["final"] = final
        out = self.stdout.getvalue()
        if len(out) > self.limits["max_stdout"]:
            out = out[: self.limits["max_stdout"]]
            result["stdoutCapped"] = True
        result.update(steps=self.steps, calls=self.calls, stdout=out, counts=self.counts())
        if error:
            result["error"] = error
        if self.capped:
            result["capped"] = self.capped
        return result

    def counts(self):
        return {
            "steps": self.step_count,
            "calls": sum(1 for c in self.calls if "kind" not in c),
            "maxDepth": self.max_depth,
            "lines": {str(k): v for k, v in sorted(self.line_hits.items())},
        }

    def describe(self, e, code):
        """The exception with a traceback of the user's own frames only."""
        source = code.splitlines()
        frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == USER_FILE]
        tb = ["Traceback (most recent call last):"]
        for f in frames:
            tb.append(f'  line {f.lineno}, in {f.name}')
            if f.lineno and 0 < f.lineno <= len(source):
                tb.append(f"    {source[f.lineno - 1].strip()}")
        msg = str(e)
        if isinstance(e, RecursionError):
            msg += " (DryRun allows %d nested calls)" % self.limits["max_depth"]
        tb.append(f"{type(e).__name__}: {msg}")
        line = frames[-1].lineno if frames else None
        return {"type": type(e).__name__, "msg": msg[: self.limits["max_str"] * 5], "line": line, "tb": "\n".join(tb)}


def run(code, stdin="", call=None, limits=None, record=True, progress=None):
    """Traces `code` and returns the result as a dict."""
    return Tracer(limits, record, progress).run(code, stdin, call or None)


def run_json(code, stdin="", call=None, limits_json="{}", record=True, progress=None):
    """The browser's entry point: JSON in, JSON out."""
    return json.dumps(run(code, stdin, call, json.loads(limits_json), record, progress), separators=(",", ":"))
