# title: Last player standing
# pattern: Queue
# call: last_standing(["Asha", "Ben", "Chen", "Dev", "Eli"], 3)
# expect: queue
# Pass the ball k - 1 times around the circle; whoever holds it next is out.
from collections import deque

def last_standing(players, k):
    circle = deque(players)
    out = []
    while len(circle) > 1:
        for _ in range(k - 1):
            circle.append(circle.popleft())
        out.append(circle.popleft())
    return circle[0]
