# title: Shortest run reaching a total
# pattern: Sliding window
# call: shortest_run([2, 1, 5, 1, 3, 2, 6, 1], 9)
# expect: array
# Grow the window on the right; shrink it from the left while it still
# reaches the target, remembering the shortest length seen.
def shortest_run(nums, target):
    best = len(nums) + 1
    window = 0
    left = 0
    for right in range(len(nums)):
        window += nums[right]
        while window >= target:
            best = min(best, right - left + 1)
            window -= nums[left]
            left += 1
    return best if best <= len(nums) else 0
