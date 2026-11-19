# title: Ways to climb with 1 or 2 steps
# pattern: Memoized DP
# call: ways(6, {})
# expect: recursion
# Without the memo this tree doubles at every level; with it, each n
# is computed once and every later visit is a lookup.
def ways(n, memo):
    if n in memo:
        return memo[n]
    if n <= 1:
        return 1
    memo[n] = ways(n - 1, memo) + ways(n - 2, memo)
    return memo[n]
