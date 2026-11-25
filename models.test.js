const assert = require('node:assert/strict');
const test = require('node:test');
const models = require('./src/models');
const movieService = require('./src/services/movieService');

test('existing user, admin, settings, session, and broadcast collections keep their names', () => {
  assert.equal(models.User.collection.name, 'users');
  assert.equal(models.Admin.collection.name, 'botadmins');
  assert.equal(models.BotConfig.collection.name, 'botconfigs');
  assert.equal(models.Session.collection.name, 'botsessions');
  assert.equal(models.BroadcastJob.collection.name, 'broadcast_jobs');
});

test('genre catalog has its own collection name', () => {
  assert.equal(models.Genre.collection.name, 'genres');
});

test('movie schema requires Telegram media and defines code and title search indexes', () => {
  assert.equal(models.Movie.schema.path('fileId').isRequired, true);
  assert.equal(models.Movie.schema.path('code').options.unique, true);
  const textIndex = models.Movie.schema.indexes().find(([index]) => index.title === 'text');
  assert.ok(textIndex);
  assert.equal(textIndex[1].default_language, 'none');
  assert.equal(textIndex[1].language_override, 'searchLanguage');
  assert.ok(models.Movie.schema.indexes().some(([index]) => index.titleNormalized === 1));
  assert.ok(models.Movie.schema.indexes().some(([index]) => index.titleNgrams === 1));
});

test('favorite records prevent duplicate user and movie pairs', () => {
  assert.ok(
    models.Favorite.schema
      .indexes()
      .some(
        ([index, options]) => index.userId === 1 && index.movieId === 1 && options.unique === true
      )
  );
});

test('movie startup migration drops the text index that treats movie language as an index override', async () => {
  const dropped = [];
  await movieService.prepareMovieTextIndex({
    async indexes() {
      return [
        {
          name: 'title_text',
          key: { _fts: 'text', _ftsx: 1 },
          weights: { title: 1 },
          language_override: 'language'
        }
      ];
    },
    async dropIndex(name) {
      dropped.push(name);
    }
  });

  assert.deepEqual(dropped, ['title_text']);
});

test('movie startup migration preserves a text index with the corrected language override', async () => {
  const dropped = [];
  await movieService.prepareMovieTextIndex({
    async indexes() {
      return [
        {
          name: 'title_text',
          key: { _fts: 'text', _ftsx: 1 },
          weights: { title: 1 },
          language_override: 'searchLanguage'
        }
      ];
    },
    async dropIndex(name) {
      dropped.push(name);
    }
  });

  assert.deepEqual(dropped, []);
});
