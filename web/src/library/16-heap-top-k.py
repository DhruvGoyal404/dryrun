# title: The k largest scores
# pattern: Heap
# call: top_k([41, 7, 63, 18, 95, 27, 70, 12], 3)
# expect: heap
# A min-heap of size k: its smallest member is the bar a new score must beat.
import heapq

def top_k(scores, k):
    heap = []
    for s in scores:
        if len(heap) < k:
            heapq.heappush(heap, s)
        elif s > heap[0]:
            heapq.heapreplace(heap, s)
    return sorted(heap, reverse=True)
