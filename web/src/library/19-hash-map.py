# title: Group words that are anagrams
# pattern: Hash map
# call: group_anagrams(["stop", "pots", "tea", "opts", "eat", "ant"])
# expect: map
# Words with the same sorted letters share a key.
def group_anagrams(words):
    groups = {}
    for w in words:
        key = "".join(sorted(w))
        if key not in groups:
            groups[key] = []
        groups[key].append(w)
    return list(groups.values())
