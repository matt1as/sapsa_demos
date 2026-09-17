#!/usr/bin/env python3
"""Delete the comments on Jira Cloud issues, to reset the SAPSA board before a demo run.

Dry run by default: it lists what would be deleted. Add --delete to actually delete.

Setup (once per shell):
  export JIRA_EMAIL=you@example.com
  export JIRA_API_TOKEN=...   # create one at https://id.atlassian.com/manage-profile/security/api-tokens

Examples:
  python3 reset_jira_comments.py SAPSA-{1..8}
  python3 reset_jira_comments.py SAPSA-{1..8} --delete
  python3 reset_jira_comments.py SAPSA-{1..10} --since 2026-09-14T21:00 --delete
"""

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

DEFAULT_SITE = "mattiasj.atlassian.net"
PAGE_SIZE = 100


def call(method, url, auth):
    request = urllib.request.Request(
        url,
        method=method,
        headers={"Authorization": f"Basic {auth}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request) as response:
        body = response.read()
        return json.loads(body) if body else None


def list_comments(site, auth, key):
    comments = []
    while True:
        query = urllib.parse.urlencode({"startAt": len(comments), "maxResults": PAGE_SIZE, "orderBy": "created"})
        page = call("GET", f"https://{site}/rest/api/3/issue/{key}/comment?{query}", auth)
        comments += page["comments"]
        if not page["comments"] or len(comments) >= page["total"]:
            return comments


def parse_jira_time(value):
    # Jira returns e.g. 2026-09-14T22:08:44.533+0200
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%f%z")


def parse_since(value):
    moment = datetime.fromisoformat(value)
    # no offset given -> treat it as local time
    return moment if moment.tzinfo else moment.astimezone()


def main():
    parser = argparse.ArgumentParser(description="Delete the comments on Jira Cloud issues (dry run unless --delete).")
    parser.add_argument("issues", nargs="+", metavar="ISSUE", help="issue keys, e.g. SAPSA-2 SAPSA-3")
    parser.add_argument("--delete", action="store_true", help="actually delete the comments")
    parser.add_argument("--since", type=parse_since,
                        help="only comments created at or after this time, e.g. 2026-09-14T21:00 (local time unless an offset is given)")
    parser.add_argument("--site", default=os.environ.get("JIRA_SITE", DEFAULT_SITE),
                        help=f"Jira site host (default: $JIRA_SITE or {DEFAULT_SITE})")
    args = parser.parse_args()

    email = os.environ.get("JIRA_EMAIL")
    token = os.environ.get("JIRA_API_TOKEN")
    if not email or not token:
        sys.exit("Set JIRA_EMAIL and JIRA_API_TOKEN first (see the top of this script).")
    auth = base64.b64encode(f"{email}:{token}".encode()).decode()

    deleted = failed = 0
    for key in args.issues:
        try:
            comments = list_comments(args.site, auth, key)
        except urllib.error.HTTPError as error:
            print(f"{key}: could not read comments (HTTP {error.code})", file=sys.stderr)
            failed += 1
            continue

        if args.since:
            comments = [c for c in comments if parse_jira_time(c["created"]) >= args.since]

        print(f"{key}: {len(comments)} comment(s)")
        for comment in comments:
            author = comment.get("author", {}).get("displayName", "unknown")
            label = f"  {comment['id']}  {comment['created'][:16]}  {author}"

            if not args.delete:
                print(f"{label}  (would delete)")
                continue

            try:
                call("DELETE", f"https://{args.site}/rest/api/3/issue/{key}/comment/{comment['id']}", auth)
                print(f"{label}  deleted")
                deleted += 1
            except urllib.error.HTTPError as error:
                print(f"{label}  FAILED (HTTP {error.code})", file=sys.stderr)
                failed += 1

    if args.delete:
        print(f"\nDeleted {deleted} comment(s), {failed} failure(s).")
    else:
        print("\nDry run - nothing deleted. Re-run with --delete.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
