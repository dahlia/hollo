Hollo
=====

> [!NOTE]
> This project is still in the early stage of development.  It is not ready for
> production use yet.

Hollo is a federated single-user microblogging software powered by [Fedify].
Although it is for single-user, it is designed to be federated through
[ActivityPub], which means that you can follow and be followed by other users
from other instances, even from other software that supports ActivityPub like
Mastodon, Misskey, and so on.

Hollo does not have its own web interface.  Instead, it implements
Mastodon-compatible APIs so that you can integrate it with the most of
the [existing Mastodon clients](#tested-clients).

[Fedify]: https://fedify.dev/
[ActivityPub]: https://www.w3.org/TR/activitypub/


Current features and roadmap
----------------------------

- [x] Logging in
- [x] Composing a post
- [x] Editing a post
- [x] Deleting a post
- [x] Writing a reply
- [x] View posts
- [x] Post visibility
- [x] Post language
- [ ] Pinned posts
- [x] Mentions
- [x] Hashtags
- [ ] Images
- [ ] Polls
- [x] Likes (favorites)
- [ ] Shares (reblogs)
- [x] Editing profile
- [x] Deleting account
- [x] Public timeline
- [x] Local timeline
- [ ] Lists
- [ ] Trends
- [ ] Search
- [x] Following/unfollowing accounts
- [x] Following/unfollowing hashtags
- [ ] Blocking accounts
- [ ] Blocking domains
- [ ] Muting accounts
- [x] Notifications
- [x] Bookmarks
- [x] Markers
- [ ] Featured hashtags
- [ ] Featured accounts


Tested clients
--------------

 -  [Elk]
 -  [Phanpy]
 -  [Woolly]

[Elk]: https://elk.zone/
[Phanpy]: https://phanpy.social/
[Woolly]: https://apps.apple.com/us/app/woolly-for-mastodon/id6444360628


Etymology
---------

The name *Hollo* is a Korean word *홀로*, which means *alone* or *solitary* in
English.  It is named so because it is designed to be a single-user software.

<!-- cSpell: ignore Misskey -->
