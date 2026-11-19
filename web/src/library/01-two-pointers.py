# title: Pair with a target sum
# pattern: Two pointers
# call: pair_with_sum([1, 3, 4, 6, 8, 11, 15], 14)
# expect: array
# Sorted input: move the left pointer up when the sum is too small,
# the right pointer down when it is too big.
def pair_with_sum(nums, target):
    left, right = 0, len(nums) - 1
    while left < right:
        total = nums[left] + nums[right]
        if total == target:
            return (left, right)
        if total < target:
            left += 1
        else:
            right -= 1
    return None
