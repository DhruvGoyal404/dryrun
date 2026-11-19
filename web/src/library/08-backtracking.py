# title: Pick k items from a list
# pattern: Recursion and backtracking
# call: choose(["a", "b", "c", "d"], 2)
# expect: recursion
# Choose or skip each item; undo the choice on the way back.
def choose(items, k):
    picked, out = [], []

    def go(i):
        if len(picked) == k:
            out.append(picked[:])
            return
        if i == len(items):
            return
        picked.append(items[i])
        go(i + 1)
        picked.pop()
        go(i + 1)

    go(0)
    return out
