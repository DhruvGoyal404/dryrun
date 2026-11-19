# title: Cheapest route on a small map
# pattern: Dijkstra
# call: cheapest({"P": [("Q", 4), ("R", 1)], "Q": [("T", 1)], "R": [("Q", 2), ("S", 5)], "S": [("T", 3)], "T": []}, "P")
# expect: graph
# Always settle the closest town not yet settled; a heap finds it.
import heapq

def cheapest(roads, start):
    best = {start: 0}
    heap = [(0, start)]
    done = set()
    while heap:
        cost, town = heapq.heappop(heap)
        if town in done:
            continue
        done.add(town)
        for nxt, toll in roads[town]:
            new = cost + toll
            if nxt not in best or new < best[nxt]:
                best[nxt] = new
                heapq.heappush(heap, (new, nxt))
    return best
