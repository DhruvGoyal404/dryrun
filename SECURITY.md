# Security

Please report vulnerabilities through GitHub's private vulnerability reporting: the
**Security** tab of this repository, then **Report a vulnerability**. Don't open a public
issue.

DryRun runs entirely in the browser and has no server or accounts. The code you trace runs
in your own browser, inside Pyodide in a Web Worker. Reports about the share-link decoder
(untrusted URL fragments), the Content Security Policy, the worker boundary or the service
worker matter most.

This is a student project with no bug bounty. You'll get a reply as soon as possible.
