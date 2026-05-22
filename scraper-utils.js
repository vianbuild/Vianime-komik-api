const axios = require('axios');
const cheerio = require('cheerio');

const KOMIKU_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
};

/** Map komiku.org pages that now load via HTMX to api.komiku.org fragments */
function resolveFetchUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://komiku.org${url}`);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host !== 'komiku.org') return url;

    const path = parsed.pathname.replace(/\/$/, '') || '/';
    const search = parsed.search || '';

    if (path === '/pustaka') return `https://api.komiku.org/manga/${search}`;
    if (path.startsWith('/other/hot')) return `https://api.komiku.org/other/hot/${search}`;
    if (parsed.searchParams.has('s')) {
      return `https://api.komiku.org/${search}`;
    }
  } catch (_) {
    /* keep original url */
  }
  return url;
}

function normalizeLink(link) {
  if (!link) return null;
  if (link.startsWith('http')) return link;
  return `https://komiku.org${link.startsWith('/') ? link : `/${link}`}`;
}

function normalizeImage(image) {
  if (!image) return null;
  let src = image;
  if (src.includes(',')) src = src.split(',')[0].trim();
  if (src.startsWith('http')) return src;
  return `https://komiku.org${src.startsWith('/') ? src : `/${src}`}`;
}

function extractComicsFromPage($) {
  const comics = [];
  const seen = new Set();

  const push = (raw) => {
    const title = (raw.title || '').replace(/\s+/g, ' ').trim();
    const link = normalizeLink(raw.link);
    const image = normalizeImage(raw.image);
    if (!title || title.length < 2 || !link || seen.has(link)) return;
    seen.add(link);
    comics.push({
      title,
      link,
      image: image || 'https://komiku.org/asset/img/no-image.png',
      chapter: (raw.chapter || 'Latest').replace(/\s+/g, ' ').trim(),
      ...(raw.extra || {}),
    });
  };

  $('article.ls4').each((i, el) => {
    const $el = $(el);
    const title =
      $el.find('.ls4j h4 a, .ls4j h3 a').text().trim() ||
      $el.find('h4 a, h3 a').text().trim();
    const link =
      $el.find('.ls4j h4 a, .ls4j h3 a').attr('href') ||
      $el.find('.ls4v a').attr('href') ||
      $el.find('a[href*="/manga/"], a[href*="/komik/"]').first().attr('href');
    const image =
      $el.find('.ls4v img, img').attr('data-src') ||
      $el.find('img').attr('src');
    const chapter =
      $el.find('a.ls24, .ls24').first().text().trim() ||
      $el.find('.chapter').text().trim();
    push({ title, link, image, chapter });
  });

  $('.bge').each((i, el) => {
    const $el = $(el);
    const link =
      $el.find('.bgei a[href*="/manga/"], .bgei a[href*="/komik/"]').first().attr('href') ||
      $el.find('.kan a[href*="/manga/"], .kan a[href*="/komik/"]').first().attr('href') ||
      $el.find('.bgei a, .kan a').first().attr('href');
    const image =
      $el.find('.bgei img').attr('src') ||
      $el.find('img').attr('data-src') ||
      $el.find('img').attr('src');
    const title =
      $el.find('.kan h3, .kan h4').text().trim() ||
      $el.find('.kan a h3, .kan a h4').text().trim() ||
      $el.find('h3, h4').first().text().trim();
    const blockText = $el.text();
    const chapterMatch = blockText.match(/Terbaru:\s*(Chapter[^\n|]+)/i);
    const chapter =
      (chapterMatch ? chapterMatch[1] : '') ||
      $el.find('a[href*="chapter"], .ls24, .chapter, .newchapter').last().text().trim();
    push({ title, link, image, chapter });
  });

  return comics;
}

async function fetchKomikuPage(url, timeout = 12000) {
  const response = await axios.get(resolveFetchUrl(url), {
    headers: KOMIKU_HEADERS,
    timeout,
  });
  return cheerio.load(response.data);
}

async function fetchComicsFromUrl(url, timeout = 12000) {
  const $ = await fetchKomikuPage(url, timeout);
  return extractComicsFromPage($);
}

module.exports = {
  KOMIKU_HEADERS,
  resolveFetchUrl,
  normalizeLink,
  normalizeImage,
  extractComicsFromPage,
  fetchKomikuPage,
  fetchComicsFromUrl,
};
