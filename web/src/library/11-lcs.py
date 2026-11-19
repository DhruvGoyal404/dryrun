# title: Longest common subsequence
# pattern: 2D DP
# call: lcs("ledger", "keeper")
# expect: grid
# dryrun: grid table
# table[i][j] is the answer for the first i letters of a and j of b.
def lcs(a, b):
    table = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                table[i][j] = table[i - 1][j - 1] + 1
            else:
                table[i][j] = max(table[i - 1][j], table[i][j - 1])
    return table[len(a)][len(b)]
