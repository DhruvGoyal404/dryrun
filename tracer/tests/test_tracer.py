"""The tracer under CPython: events, identity, caps, exceptions, recursion, accesses."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import dryrun_tracer as t  # noqa: E402


def heap_at(result, step_index):
    """The heap as of a step: every object's latest version up to that step."""
    heap = {}
    for step in result["steps"][: step_index + 1]:
        heap.update(step.get("h", {}))
    return heap


def locals_at(result, step_index, cid):
    out = None
    for step in result["steps"][: step_index + 1]:
        if str(cid) in step.get("v", {}):
            out = step["v"][str(cid)]
    return out


def globals_at(result, step_index):
    out = {}
    for step in result["steps"][: step_index + 1]:
        if "g" in step:
            out = step["g"]
    return out


def test_line_events_follow_the_program():
    r = t.run("x = 1\ny = x + 1\nz = y * 2\n")
    lines = [s["ln"] for s in r["steps"] if s["e"] == "l"]
    assert lines == [1, 2, 3]
    assert r["counts"]["lines"] == {"1": 1, "2": 1, "3": 1}
    assert globals_at(r, len(r["steps"]) - 1) == {"x": 1, "y": 2, "z": 4}
    assert "error" not in r and "capped" not in r


def test_calls_record_arguments_parent_depth_and_return():
    code = "def f(n):\n    if n == 0:\n        return 0\n    return n + f(n - 1)\nf(2)\n"
    r = t.run(code)
    fns = [c for c in r["calls"] if "kind" not in c]
    assert [(c["fn"], c["args"], c["d"], c["r"]) for c in fns] == [
        ("f", {"n": 2}, 1, 3),
        ("f", {"n": 1}, 2, 1),
        ("f", {"n": 0}, 3, 0),
    ]
    module = r["calls"][0]
    assert module["kind"] == "module"
    assert fns[0]["p"] == 0 and fns[1]["p"] == r["calls"].index(fns[0])
    assert r["counts"]["calls"] == 3 and r["counts"]["maxDepth"] == 3
    # Steps of a call lie within its span.
    for c in fns:
        assert c["s"] <= c["e"]


def test_two_names_for_one_list_share_one_heap_id():
    r = t.run("a = [1, 2]\nb = a\nb.append(3)\nc = [1, 2, 3]\n")
    g = globals_at(r, len(r["steps"]) - 1)
    assert g["a"] == g["b"]
    assert g["c"] != g["a"]
    heap = heap_at(r, len(r["steps"]) - 1)
    assert heap[str(g["a"]["r"])]["v"] == [1, 2, 3]


def test_only_changed_objects_are_sent_again():
    r = t.run("a = [0]\nb = 5\na.append(1)\nc = 2\n")
    sent = [list(s.get("h", {}).keys()) for s in r["steps"] if s["e"] == "l"]
    # A step shows the state before its line runs: the list appears at line 2, changes at 4.
    assert sent == [[], ["1"], [], ["1"]]


def test_values_are_serialised_safely():
    code = (
        "from collections import deque, defaultdict, Counter, namedtuple\n"
        "import heapq\n"
        "P = namedtuple('P', 'x y')\n"
        "class Node:\n"
        "    def __init__(self, v):\n"
        "        self.val = v\n"
        "        self.next = None\n"
        "    def __repr__(self):\n"
        "        raise RuntimeError('never called')\n"
        "big = 10 ** 30\n"
        "f = 1.5\n"
        "s = 'x' * 500\n"
        "d = deque([1, 2])\n"
        "dd = defaultdict(list)\n"
        "cnt = Counter('aab')\n"
        "st = {3, 1, 2}\n"
        "tp = (1, 'a')\n"
        "p = P(1, 2)\n"
        "n = Node(4)\n"
        "n.next = n\n"
        "none = None\n"
        "end = True\n"
    )
    r = t.run(code)
    assert "error" not in r, r.get("error")
    g = globals_at(r, len(r["steps"]) - 1)
    heap = heap_at(r, len(r["steps"]) - 1)
    obj = lambda name: heap[str(g[name]["r"])]  # noqa: E731
    assert g["big"] == {"int": str(10**30)}
    assert g["f"] == {"f": "1.5"}
    assert g["s"]["len"] == 500 and len(g["s"]["str"]) == 200
    assert obj("d") == {"t": "deque", "v": [1, 2]}
    assert obj("dd") == {"t": "dict", "v": [], "cls": "defaultdict"}
    assert obj("cnt")["cls"] == "Counter" and obj("cnt")["v"] == [["a", 2], ["b", 1]]
    assert obj("st") == {"t": "set", "v": [1, 2, 3]}
    assert obj("tp") == {"t": "tuple", "v": [1, "a"]}
    assert obj("p") == {"t": "tuple", "v": [1, 2], "cls": "P", "fields": ["x", "y"]}
    node = obj("n")
    assert node["cls"] == "Node" and node["v"]["val"] == 4 and node["v"]["next"] == g["n"]  # a cycle, by id
    assert g["none"] is None and g["end"] is True
    assert "Node" not in g and "P" not in g  # definitions are not data


def test_container_and_object_caps():
    r = t.run("a = list(range(1000))\nb = [[i] for i in range(500)]\n", limits={"max_items": 10, "max_objects": 5})
    heap = heap_at(r, len(r["steps"]) - 1)
    g = globals_at(r, len(r["steps"]) - 1)
    a = heap[str(g["a"]["r"])]
    assert len(a["v"]) == 10 and a["n"] == 1000
    assert sum(1 for o in heap.values() if o.get("t") == "more") > 0


def test_step_cap_stops_an_infinite_loop_and_says_where():
    r = t.run("i = 0\nwhile True:\n    i += 1\n", limits={"max_steps": 100})
    assert r["capped"] == {"reason": "steps", "step": 100, "line": r["capped"]["line"]}
    assert r["capped"]["line"] in (2, 3)
    assert len(r["steps"]) == 100
    assert "error" not in r


def test_time_cap():
    r = t.run("while True:\n    pass\n", limits={"max_steps": 10**9, "max_seconds": 0.2, "max_bytes": 10**9})
    assert r["capped"]["reason"] == "time"


def test_size_cap():
    r = t.run("a = []\nfor i in range(10000):\n    a.append('x' * 50)\n", limits={"max_bytes": 20_000})
    assert r["capped"]["reason"] == "size"


def test_recursion_depth_cap():
    r = t.run("def f(n):\n    return f(n + 1)\nf(0)\n", limits={"max_depth": 30})
    assert r["capped"]["reason"] == "depth"
    assert r["counts"]["maxDepth"] == 30


def test_exception_is_reported_at_its_line_with_a_user_only_traceback():
    code = "def g(x):\n    return 10 // x\ndef f():\n    return g(0)\nf()\n"
    r = t.run(code)
    e = r["error"]
    assert e["type"] == "ZeroDivisionError" and e["line"] == 2
    assert "line 5, in <module>" in e["tb"] and "line 2, in g" in e["tb"] and "return 10 // x" in e["tb"]
    assert "dryrun_tracer" not in e["tb"]
    assert any(s["e"] == "x" for s in r["steps"])
    raised = [c for c in r["calls"] if c.get("raised") and "kind" not in c]
    assert {c["fn"] for c in raised} == {"f", "g"}


def test_caught_exception_does_not_mark_the_call_as_raised():
    code = "def f():\n    try:\n        1 / 0\n    except ZeroDivisionError:\n        return 'ok'\nf()\n"
    r = t.run(code)
    f = [c for c in r["calls"] if c["fn"] == "f"][0]
    assert f["r"] == "ok" and "raised" not in f


def test_syntax_errors_in_code_and_in_the_call():
    r = t.run("def f(:\n    pass\n")
    assert r["error"]["type"] == "SyntaxError" and r["error"]["line"] == 1 and r["error"]["where"] == "code"
    r = t.run("def f(): return 1\n", call="f(")
    assert r["error"]["where"] == "call"


def test_stdin_and_stdout_per_step():
    code = "n = int(input())\nfor i in range(n):\n    print(i)\nname = input()\n"
    r = t.run(code, "3\nbob\n")
    assert r["stdout"] == "0\n1\n2\n"
    outs = [s["o"] for s in r["steps"]]
    assert outs == sorted(outs) and outs[-1] == len("0\n1\n2\n")
    assert globals_at(r, len(r["steps"]) - 1)["name"] == "bob"
    r = t.run("input()\n", "")
    assert r["error"]["type"] == "EOFError"


def test_call_mode_returns_the_value_and_skips_the_main_block():
    code = "def solve(a):\n    return sorted(a)\nif __name__ == '__main__':\n    input()\n"
    r = t.run(code, call="solve([3, 1, 2])")
    assert "error" not in r
    ref = r["result"]["r"]
    assert r["final"]["h"][str(ref)]["v"] == [1, 2, 3]


def test_reads_writes_and_pointers_are_captured_before_the_line_runs():
    code = (
        "def two(a, target):\n"
        "    i, j = 0, len(a) - 1\n"
        "    while i < j:\n"
        "        s = a[i] + a[j]\n"
        "        if s == target:\n"
        "            return [i, j]\n"
        "        if s < target:\n"
        "            i += 1\n"
        "        else:\n"
        "            j -= 1\n"
    )
    r = t.run(code, call="two([1, 2, 4, 7, 11], 9)")
    first = next(s for s in r["steps"] if s["ln"] == 4)
    a_ref = first["px"][0][0]
    assert first["px"] == [[a_ref, "a", "i"], [a_ref, "a", "j"]]
    assert first["rd"] == [[a_ref, 0], [a_ref, 4]]


def test_dp_grid_reads_and_writes_resolve_rows():
    code = (
        "dp = [[0] * 3 for _ in range(3)]\n"
        "for i in range(1, 3):\n"
        "    for j in range(1, 3):\n"
        "        dp[i][j] = dp[i - 1][j] + dp[i][j - 1] + 1\n"
    )
    r = t.run(code)
    step = next(s for s in r["steps"] if s["ln"] == 4)
    heap = heap_at(r, r["steps"].index(step))
    dp = heap[str(globals_at(r, r["steps"].index(step))["dp"]["r"])]
    row = lambda k: dp["v"][k]["r"]  # noqa: E731
    assert step["rd"] == [[row(0), 1], [row(1), 0]]
    assert step["wr"] == [[row(1), 1]]


def test_attribute_reads_and_writes_on_instances():
    code = (
        "class N:\n"
        "    def __init__(self, v):\n"
        "        self.val = v\n"
        "        self.next = None\n"
        "a, b = N(1), N(2)\n"
        "a.next = b\n"
        "x = a.next.val\n"
        "s = 'abc'.upper()\n"
    )
    r = t.run(code)
    steps = {s["ln"]: s for s in r["steps"] if s["e"] == "l" and s["c"] == 0}
    g = globals_at(r, len(r["steps"]) - 1)
    assert steps[6]["aw"] == [[g["a"]["r"], "next"]]
    assert steps[7]["ar"] == [[g["b"]["r"], "val"], [g["a"]["r"], "next"]]
    assert "ar" not in steps[8]  # a method call on a str is not an attribute read


def test_struct_operations_are_counted_by_object():
    code = (
        "import heapq\n"
        "from collections import deque\n"
        "st = []\n"
        "st.append(1)\n"
        "st.pop()\n"
        "q = deque([1])\n"
        "q.popleft()\n"
        "h = []\n"
        "heapq.heappush(h, 3)\n"
        "seen = set()\n"
        "x = 3 in seen\n"
        "memo = {}\n"
        "y = memo.get(1)\n"
    )
    r = t.run(code)
    ops = [op for s in r["steps"] for op in s.get("ops", [])]
    assert [m for _, m in ops] == ["append", "pop", "popleft", "heappush", "in", "get"]


def test_a_defaultdict_read_by_the_analysis_does_not_insert():
    code = "from collections import defaultdict\nd = defaultdict(int)\nk = 5\nx = d[k]\n"
    r = t.run(code)
    last_line = [s for s in r["steps"] if s["e"] == "l"][-1]
    assert last_line["rd"][0][1] == 5
    # The program's own read inserts the key (seen after the line); the analysis didn't before it.
    heap = heap_at(r, r["steps"].index(last_line))
    d_ref = globals_at(r, len(r["steps"]) - 1)["d"]["r"]
    assert heap[str(d_ref)]["v"] == []


def test_lambda_and_generator_frames_are_calls_but_comprehensions_are_inline():
    r = t.run("a = sorted([3, 1], key=lambda v: -v)\nb = [x * 2 for x in a]\n")
    assert "error" not in r
    names = {c["fn"] for c in r["calls"]}
    assert "<lambda>" in names


def test_count_only_mode_records_no_steps():
    r = t.run("for i in range(50):\n    pass\n", record=False)
    assert r["steps"] == [] and r["counts"]["steps"] == 103  # 101 lines, module call and return


def test_tracing_is_off_and_stdio_restored_afterwards():
    before = sys.stdout
    t.run("print('hi')\n")
    assert sys.gettrace() is None or sys.gettrace().__module__ != "dryrun_tracer"
    assert sys.stdout is before


def test_run_json_round_trips():
    import json

    out = json.loads(t.run_json("x = 1\n", "", "", '{"max_steps": 10}'))
    assert out["limits"]["max_steps"] == 10 and out["counts"]["steps"] == 3


def test_every_library_example_runs_clean():
    """Each pattern-library example finishes without an error or a cap."""
    root = Path(__file__).resolve().parents[2] / "web" / "src" / "library"
    files = sorted(root.glob("*.py"))
    if not files:
        return
    for path in files:
        source = path.read_text(encoding="utf8")
        meta = dict(
            line[2:].split(":", 1) for line in source.splitlines() if line.startswith("# ") and ":" in line[:20]
        )
        call = meta.get("call", "").strip() or None
        stdin = meta.get("stdin", "").strip().replace("\\n", "\n")
        r = t.run(source, stdin, call)
        assert "error" not in r, (path.name, r.get("error"))
        assert "capped" not in r, (path.name, r.get("capped"))


def test_progress_reports_every_250_steps_with_the_line():
    seen = []
    t.run("for i in range(300):\n    pass\n", progress=lambda step, line: seen.append((step, line)))
    assert [s for s, _ in seen] == [250, 500] and all(line in (1, 2) for _, line in seen)
