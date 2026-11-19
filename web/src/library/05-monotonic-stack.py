# title: Days until a warmer reading
# pattern: Monotonic stack
# call: days_until_warmer([31, 33, 30, 29, 34, 32, 35])
# expect: stack
# The stack holds the days still waiting for a warmer one,
# coldest on top.
def days_until_warmer(temps):
    wait = [0] * len(temps)
    stack = []
    for day, t in enumerate(temps):
        while stack and temps[stack[-1]] < t:
            prev = stack.pop()
            wait[prev] = day - prev
        stack.append(day)
    return wait
