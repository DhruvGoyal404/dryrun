# title: Reverse a linked list
# pattern: Linked list
# call: reverse(build([1, 2, 3, 4, 5]))
# expect: linked
# Turn each next arrow around, keeping prev and curr one node apart.
class Node:
    def __init__(self, val, next=None):
        self.val = val
        self.next = next

def build(values):
    head = None
    for v in reversed(values):
        head = Node(v, head)
    return head

def reverse(head):
    prev, curr = None, head
    while curr:
        nxt = curr.next
        curr.next = prev
        prev, curr = curr, nxt
    return prev
