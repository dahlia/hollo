Hollo changelog
===============

Version 0.2.0
-------------

To be released.

 -  Added two-factor authentication support.  [[#38]]

 -  Custom emojis now can be deleted from the administration dashboard.

 -  Added support for reporting remote accounts and posts.
    [[#41] by Emelia Smith]

 -  Improved alignment on Mastodon API changes about OAuth and apps.
    [[#43] by Emelia Smith]

     -  `GET /api/v1/apps/verify_credentials` no longer requires `read` scope,
        just a valid access token (or client credential).
     -  `POST /api/v1/apps` now supports multiple redirect URIs.
     -  `redirect_uri` is deprecated, but software may still rely on it until
        they switch to `redirect_uris`.
     -  Expose `redirect_uri`, `redirect_uris`, and `scopes` to verify
        credentials for apps.

 -  Added support for RFC 8414 for OAuth Authorization Server metadata endpoint.
    [[#47] by Emelia Smith]

 -  Added a favicon.

 -  Added `LISTEN_PORT` and `ALLOW_PRIVATE_ADDRESS` environment variables.
    [[#53] by Helge Krueger]

[#38]: https://github.com/dahlia/hollo/issues/38
[#41]: https://github.com/dahlia/hollo/pull/41
[#43]: https://github.com/dahlia/hollo/pull/43
[#47]: https://github.com/dahlia/hollo/pull/47
[#53]: https://github.com/dahlia/hollo/pull/53


Version 0.1.6
-------------

Released on October 30, 2024.

 -  Fixed a bug where followers-only posts from accounts that had had set
    their follower lists to private had been recognized as direct messages.
    Even after upgrading to this version, such accounts need to be force-refreshed
    from the administration dashboard to fix the issue.

 -  Fixed the federated (public) timeline showing the shared posts from
    the blocked or muted accounts.

 -  Fixed the list timeline showing the shared posts from the blocked or muted
    accounts.


Version 0.1.5
-------------

Released on October 30, 2024.

 -  Fixed the profile page showing the shared posts from the blocked or muted
    accounts.


Version 0.1.4
-------------

Released on October 30, 2024.

 -  Fixed the home timeline showing the shared posts from the blocked or muted
    accounts.


Version 0.1.3
-------------

Released on October 27, 2024.

 -  Fixed incorrect handling of relative path URIs in `Link` headers with
    `rel=alternate`.  This caused inoperability with some software such as
    GoToSocial.
 -  It now sends `Delete(Person)` activity to followees besides followers
    when a user deletes their account.


Version 0.1.2
-------------

Released on October 24, 2024.

 -  Fixed the last page in the profile using Moshidon leading to infinite
    pagination.  [[#48] by  Emelia Smith]

[#48]: https://github.com/dahlia/hollo/issues/48


Version 0.1.1
-------------

Released on October 24, 2024.

 -  Upgrade Fedify to 1.1.1.


Version 0.1.0
-------------

Released on October 22, 2024.  Initial release.
