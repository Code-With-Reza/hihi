const express = require('express');
const fetch = require('node-fetch');
const app = express();

const cache = require('./cache');

const reChannelName = /"owner":{"videoOwnerRenderer":{"thumbnail":{"thumbnails":\[.*?\]},"title":{"runs":\[{"text":"(.+?)"/;

const getLiveStream = async (url) => {
  let data = await cache?.get(url);

  if (data) {
    return JSON.parse(data);
  } else {
    data = {};

    try {
      const response = await fetch(url);

      if (response.ok) {
        const text = await response.text();
        const stream = text.match(/(?<=hlsManifestUrl":").*\.m3u8/)?.[0];
        const name = reChannelName.exec(text)?.[1];
        const logo = text.match(/(?<=owner":{"videoOwnerRenderer":{"thumbnail":{"thumbnails":\[{"url":")[^=]*/)?.[0];

        data = { name, stream, logo };
      } else {
        console.log(JSON.stringify({
          url,
          status: response.status
        }));
      }
    } catch (error) {
      console.log(error);
    }

    await cache?.set(url, JSON.stringify(data), { EX: 300 });

    return data;
  }
};

app.use(require('express-status-monitor')());

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get('/', (req, res, nxt) => {
  try {
    res.json({ message: 'Status OK' });
  } catch (err) {
    nxt(err);
  }
});

app.get('/channel/:id.m3u8', async (req, res, nxt) => {
  try {
    const url = `https://www.youtube.com/channel/${req.params.id}/live`;
    const { stream } = await getLiveStream(url);

    if (stream) {
      // Proxy the stream
      const response = await fetch(stream);
      const streamText = await response.text();
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(streamText);
    } else {
      // No stream found
      res.sendStatus(204);
    }
  } catch (err) {
    nxt(err);
  }
});

// Proxy route for video
app.get('/video/:id.m3u8', async (req, res, nxt) => {
  try {
    const url = `https://www.youtube.com/watch?v=${req.params.id}/live`;
    const { stream } = await getLiveStream(url);

    if (stream) {
      // Proxy the stream
      const response = await fetch(stream);
      const streamText = await response.text();
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(streamText);
    } else {
      // No stream found
      res.sendStatus(204);
    }
  } catch (err) {
    nxt(err);
  }
});

app.get('/cache', async (req, res, nxt) => {
  try {
    const keys = await cache?.keys('*');

    const items = [];

    for (const key of keys) {
      const data = JSON.parse(await cache?.get(key));

      if (data) {
        items.push({
          url: key,
          name: data.name,
          logo: data.logo
        });
      }
    }

    res.json(items);
  } catch (err) { nxt(err); }
});

const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`express app (node ${process.version}) is running on port ${port}`);
});
