# title: Range totals from a prefix array
# pattern: Prefix sums
# stdin: 6\n3 -1 4 2 5 -3\n2\n1 3\n0 5
# expect: array
# prefix[i] is the total of the first i numbers, so any range total
# is one subtraction.
n = int(input())
nums = list(map(int, input().split()))
prefix = [0] * (n + 1)
for i in range(n):
    prefix[i + 1] = prefix[i] + nums[i]
for _ in range(int(input())):
    a, b = map(int, input().split())
    print(prefix[b + 1] - prefix[a])
