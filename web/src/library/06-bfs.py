# title: Fewest hops between two stations
# pattern: Queue / BFS
# call: fewest_hops({"A": ["B", "C"], "B": ["D"], "C": ["D", "E"], "D": ["F"], "E": ["F"], "F": []}, "A", "F")
# expect: graph
# Breadth-first: every station at distance d is visited before any at d + 1.
from collections import deque

def fewest_hops(graph, start, goal):
    dist = {start: 0}
    queue = deque([start])
    while queue:
        node = queue.popleft()
        if node == goal:
            return dist[node]
        for nxt in graph[node]:
            if nxt not in dist:
                dist[nxt] = dist[node] + 1
                queue.append(nxt)
    return -1
