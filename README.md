<picture>
  <source srcset="logo-white.svg" media="(prefers-color-scheme: dark)">
  <img src="logo.svg" width="50" height="50">
</picture>


Hollo
=====

[![Official Hollo][Official Hollo badge]][Official Hollo]

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

[Official Hollo]: https://hollo.social/@hollo
[Official Hollo badge]: https://fedi-badge.deno.dev/@hollo@hollo.social/followers.svg
[Fedify]: https://fedify.dev/
[ActivityPub]: https://www.w3.org/TR/activitypub/


How to deploy
-------------

### Railway

[![Deploy on Railway][]][Railway template]

The simplest way to deploy Hollo is Railway.  Click the button above to deploy
Hollo on Railway.  With this template, you can get started with your own Hollo
in just a few clicks.

To deploy Hollo, you need S3 or S3-compatible object storage for storing media
such as images.  There are many S3-compatible object storage services,
including AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, and Linode Object
Storage.  Once you have your object storage ready, you'll need to configure
the environment variables below appropriately (see how to use the S3 client API
for each service):

 -  `S3_BUCKET`: The bucket name of the S3-compatible object storage.
 -  `S3_URL_BASE`: The public URL base of the S3-compatible object storage.
 -  `S3_ENDPOINT_URL`: The endpoint URL for S3-compatible object storage. 
 -  `AWS_ACCESS_KEY_ID`: The access key for S3-compatible object storage.
 -  `AWS_SECRET_ACCESS_KEY`: The secret key for S3-compatible object storage.

Once you've set up your environment variables and Hollo is deployed on Railway,
go to https://yourdomain/setup to set up your login credentials and add your
profile.

> [!NOTE]
> You need to decide on a domain name *before* you start setting up Hollo for
> the first time. This is because *you can't change your domain name once
> Hollo is set up.*

Once you've created your profile, you're ready to start enjoying Hollo.
It's worth noting that Hollo doesn't have much of a web interface of its own,
so you'll need to use a client app like [Phanpy] for now.

[Deploy on Railway]: https://railway.app/button.svg
[Railway template]: https://railway.app/template/eopPyH?referralCode=qeEK5G

### Docker

The official Docker images are available on [GitHub Packages]:
`ghcr.io/dahlia/hollo`.  Besides this image, you need to set up a PostgreSQL
database, Redis, Meilisearch, and an S3-compatible object storage for media
storage.  You can use the following environment variables to configure Hollo:

 -  `DATABASE_URL`: The URL of the PostgreSQL database.
 -  `REDIS_URL`: The URL of the Redis server.
 -  `MEILI_URL`: The host URL of the Meilisearch server.
 -  `MEILI_MASTER_KEY`: The API key for the Meilisearch server.
 -  `SECRET_KEY`: The secret key for securing the session.
 -  `LOG_LEVEL`: The log level for the application.  `debug`, `info`, `warning`,
    `error`, and `fatal` are available.
 -  `BEHIND_PROXY`: Set this to `true` if Hollo is behind a reverse proxy.
 -  `S3_BUCKET`: The bucket name of the S3-compatible object storage.
 -  `S3_URL_BASE`: The public URL base of the S3-compatible object storage.
 -  `S3_ENDPOINT_URL`: The endpoint URL for S3-compatible object storage. 
 -  `AWS_ACCESS_KEY_ID`: The access key for S3-compatible object storage.
 -  `AWS_SECRET_ACCESS_KEY`: The secret key for S3-compatible object storage.

The image exposes the port 3000, so you can run it like this:

~~~~ sh
docker run -d -p 3000:3000 \
  -e DATABASE_URL=postgres://user:password@host:port/database \
  -e REDIS_URL=redis://host:port/0 \
  -e MEILI_URL=http://host:7700 \
  -e MEILI_MASTER_KEY=your-master-key \
  -e SECRET_KEY=your-secret-key \
  -e LOG_LEVEL=info \
  -e BEHIND_PROXY=true \
  -e S3_BUCKET=your-bucket \
  -e S3_URL_BASE=https://your-bucket.s3.amazonaws.com \
  -e S3_ENDPOINT_URL=https://s3.amazonaws.com \
  -e AWS_ACCESS_KEY_ID=your-access-key \
  -e AWS_SECRET_ACCESS_KEY=your-secret-access-key \
  ghcr.io/dahlia/hollo:latest
~~~~

[GitHub Packages]: https://github.com/dahlia/hollo/pkgs/container/hollo


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
- [x] Pinned posts
- [x] Mentions
- [x] Hashtags
- [x] Media attachments
- [ ] Polls
- [x] Likes (favorites)
- [x] Shares (reblogs)
- [x] Editing profile
- [x] Deleting account
- [x] Public timeline
- [x] Local timeline
- [ ] Lists
- [ ] Trends
- [x] Search
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
 -  [Phanpy] (recommended)
 -  [Woolly]

[Elk]: https://elk.zone/
[Phanpy]: https://phanpy.social/
[Woolly]: https://apps.apple.com/us/app/woolly-for-mastodon/id6444360628


Etymology
---------

The name *Hollo* is a Korean word *홀로*, which means *alone* or *solitary* in
English.  It is named so because it is designed to be a single-user software.

<!-- cSpell: ignore Misskey -->
