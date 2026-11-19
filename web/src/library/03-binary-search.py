# title: First position not below a value
# pattern: Binary search
# call: lower_bound([2, 4, 4, 7, 9, 12, 15, 21], 9)
# expect: array
# Keep the answer inside [lo, hi): halve the range each step.
def lower_bound(nums, value):
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] < value:
            lo = mid + 1
        else:
            hi = mid
    return lo
