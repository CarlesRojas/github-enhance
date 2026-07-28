# Chrome Web Store listing

Copy each section into the matching field on the store listing.

## Title

_(store item name, max 45 characters)_

GitHub Enhance

## Short description

_(store summary, max 132 characters)_

Visually enhance GitHub: a card-based pull request redesign, absolute dates, sidebar controls, and handy layout tweaks.

## Long description

_(store detailed description)_

GitHub Enhance makes GitHub, especially the pull request page, nicer to look at
and work with. Every feature is optional and set from one popup, and all colors
come from GitHub's own theme, so it fits light, dark, dimmed, and custom themes.

🎨 Pull request redesign (on by default)
A clean, card-based page: the page and header share one background, and the
sidebar sections, checks/merge box, comments, comment editor, changed-file
blocks, and nav tabs become rounded cards. The merge box takes on its status
color, green when checks pass.

📅 Absolute dates
Swap relative dates like “3 days ago” for the exact date and time, with
independent date and time formats and an option to drop the current year.

🎛️ Sidebar controls
Hide any sidebar section you don't use, each with its own toggle: Reviewers,
Assignees, Labels, Projects, Milestone, Development, Notifications,
Participants, and Lock conversation.

🔎 My Pull Requests tab
Turn a repository's “Pull requests” tab into “My Pull Requests”, opening the
same page filtered to your own open pull requests.

🙈 One-click hide
A Hide button collapses a comment as “outdated” in one click; an Unhide button
brings it back.

📐 Layout tweaks
Move the checks/merge box up (above the timeline, or into the sidebar on wide
screens), move the comment box to the top, hide the Community Guidelines and
ProTip notices, and set the sidebar and page width with sliders.

🔒 Privacy
Runs only on github.com and stores only your settings, synced by your browser.
No accounts, no tracking, no external servers, no data collection.

## Privacy practices (answers for the store form)

**Single purpose**

Visually enhance the GitHub website.

**`storage` justification**

The storage permission saves the user's own configuration: which features are
enabled and their options (such as date and time format, hidden sidebar
sections, and sidebar and page width). It uses chrome.storage.sync so these
settings persist between sessions and sync across the user's devices. Only the
user's preferences are stored. No page content or personal data is stored, and
nothing is sent off the device.

**Host permission justification** (`https://github.com/*`)

The extension's single purpose is to visually enhance GitHub, so its content
script and styles must run on GitHub pages. The https://github.com/* match lets
the content script read and restyle the current GitHub page (for example
reformat dates, hide sidebar sections, and apply the pull request redesign).
Access is limited to github.com only. The extension does not run on, read, or
send data to any other site, and makes no network requests.

**Are you using remote code?**

No, I am not using remote code.

Justification (if asked): All JavaScript and CSS are bundled in the extension
package. It loads no external scripts, uses no eval() or new Function(), and
never fetches or executes remote code.

**Data usage**

Check none of the boxes. The extension does not collect or transmit any user
data. It only reads the current GitHub page locally to change its appearance and
stores the user's own settings with chrome.storage. Nothing leaves the device.

Certify all three disclosures (all are true):
- I do not sell or transfer user data to third parties, outside of the approved
  use cases.
- I do not use or transfer user data for purposes unrelated to my item's single
  purpose.
- I do not use or transfer user data to determine creditworthiness or for
  lending purposes.

**Privacy policy URL**

https://github.com/CarlesRojas/github-enhance/blob/main/PRIVACY.md

(Works once `PRIVACY.md` is on the default branch. A rendered GitHub markdown
page is an acceptable privacy policy URL.)
