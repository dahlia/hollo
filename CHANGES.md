Hollo changelog
===============

Version 0.2.3
-------------

Released on November 22, 2024.

 -  Fixed a bug where followees and followers that had not been approved
    follow requests had been shown in the followees and followers lists.

 -  Fixed a bug where followees and followers had been listed in the wrong
    order in the followees and followers lists.  [[#71]]

 -  Upgrade Fedify to 1.2.7.

[#71]: https://github.com/dahlia/hollo/issues/71


Version 0.2.2
-------------

Released on November 7, 2024.

 -  Fixed a bug where replies without mention had not shown up in
    the notifications.  [[#62]]

[#62]: https://github.com/dahlia/hollo/issues/62


Version 0.2.1
-------------

Released on November 4, 2024.

- Fixed a bug where posts from some ActivityPub software (e.g., Misskey,
  Sharkey, Akkoma) had empty `url` fields, causing them to be displayed
  incorrectly in client apps. [[#58]]

## Version 0.2.0

Released on November 3, 2024.

- Dropped support for Redis.

- Added two-factor authentication support. [[#38]]

- Custom emojis now can be deleted from the administration dashboard.

- Renamed the _Data_ menu from the administration dashboard to _Federation_.

  - Now posts also can be force-refreshed.
  - Now the number of messages in the task queue is shown.

- Added support for reporting remote accounts and posts.
  [[#41] by Emelia Smith]

- Improved alignment on Mastodon API changes about OAuth and apps.
  [[#43] by Emelia Smith]

  - `GET /api/v1/apps/verify_credentials` no longer requires `read` scope,
    just a valid access token (or client credential).
  - `POST /api/v1/apps` now supports multiple redirect URIs.
  - `redirect_uri` is deprecated, but software may still rely on it until
    they switch to `redirect_uris`.
  - Expose `redirect_uri`, `redirect_uris`, and `scopes` to verify
    credentials for apps.

- Added support for RFC 8414 for OAuth Authorization Server metadata endpoint.
  [[#47] by Emelia Smith]

- On creating a new account, the user now can choose to follow the official
  Hollo account.

- Added a favicon.

- Added `PORT` and `ALLOW_PRIVATE_ADDRESS` environment variables.
  [[#53] by Helge Krueger]

[#38]: https://github.com/dahlia/hollo/issues/38
[#41]: https://github.com/dahlia/hollo/pull/41
[#43]: https://github.com/dahlia/hollo/pull/43
[#47]: https://github.com/dahlia/hollo/pull/47
[#53]: https://github.com/dahlia/hollo/pull/53

## Version 0.1.7

Released on November 4, 2024.

- Fixed a bug where posts from some ActivityPub software (e.g., Misskey,
  Sharkey, Akkoma) had empty `url` fields, causing them to be displayed
  incorrectly in client apps. [[#58]]

[#58]: https://github.com/dahlia/hollo/issues/58

## Version 0.1.6

Released on October 30, 2024.

- Fixed a bug where followers-only posts from accounts that had had set
  their follower lists to private had been recognized as direct messages.
  Even after upgrading to this version, such accounts need to be force-refreshed
  from the administration dashboard to fix the issue.

- Fixed the federated (public) timeline showing the shared posts from
  the blocked or muted accounts.

- Fixed the list timeline showing the shared posts from the blocked or muted
  accounts.

## Version 0.1.5

Released on October 30, 2024.

- Fixed the profile page showing the shared posts from the blocked or muted
  accounts.

## Version 0.1.4

Released on October 30, 2024.

- Fixed the home timeline showing the shared posts from the blocked or muted
  accounts.

## Version 0.1.3

Released on October 27, 2024.

- Fixed incorrect handling of relative path URIs in `Link` headers with
  `rel=alternate`. This caused inoperability with some software such as
  GoToSocial.
- It now sends `Delete(Person)` activity to followees besides followers
  when a user deletes their account.

## Version 0.1.2

Released on October 24, 2024.

- Fixed the last page in the profile using Moshidon leading to infinite
  pagination. [[#48] by Emelia Smith]

[#48]: https://github.com/dahlia/hollo/issues/48

## Version 0.1.1

Released on October 24, 2024.

- Upgrade Fedify to 1.1.1.

## Version 0.1.0

Released on October 22, 2024. Initial release.
