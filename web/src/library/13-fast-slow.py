# title: Middle node with fast and slow pointers
# pattern: Linked list
# call: middle(build([10, 20, 30, 40, 50, 60, 70]))
# expect: linked
# fast moves two nodes for each one slow moves: when fast runs out,
# slow is halfway.
class Node:
    def __init__(self, val, next=None):
        self.val = val
        self.next = next

def build(values):
    head = None
    for v in reversed(values):
        head = Node(v, head)
    return head

def middle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow.val
