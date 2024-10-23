Hollo changelog
===============

Version 0.2.0
-------------

To be released.

 -  Added two-factor authentication support.  [[#38]]

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

[#38]: https://github.com/dahlia/hollo/issues/38
[#41]: https://github.com/dahlia/hollo/pull/41
[#43]: https://github.com/dahlia/hollo/pull/43
[#47]: https://github.com/dahlia/hollo/pull/47


Version 0.1.0
-------------

Released on October 22, 2024.  Initial release.
