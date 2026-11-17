// Real photographs for the sample church (the tutorial), in place of drawings.
//
// ---------------------------------------------------------------------------
// ASKED FOR ON 17 NOVEMBER 2026: the sample looked like a mock-up, and real
// pictures were wanted.
//
// EVERY ONE IS CC0, dedicated to the public domain by its photographer on
// Unsplash and kept on Wikimedia Commons, where the dedication is recorded
// (`page`). CC0 asks for no credit; it is given anyway, here and in
// public/third-party-notices.txt. None shows a real church member of this app.
//
// THE FILES ARE NOT IN THE REPOSITORY. app/api/updates/sample-photo fetches
// one of these exact addresses (never one a caller names) and passes the
// bytes on as this app's own image, so the content policy stays
// `img-src 'self'`. A copy with no internet, or one that cannot reach
// Wikimedia, gets the drawing named in `fallback` instead, so a picture is
// never broken.
// ---------------------------------------------------------------------------

export interface SamplePhoto {
  src: string;
  page: string;
  photographer: string;
  fallback: string;
}

const COMMONS = 'https://thumb.wikimedia.org/wikipedia/commons/thumb';

export const SAMPLE_PHOTOS: Record<string, SamplePhoto> = {
  worship: {
    src: `${COMMONS}/9/96/Praise_and_Worship_-_Louvor_e_adora%C3%A7%C3%A3o_%28Unsplash%29.jpg/1280px-Praise_and_Worship_-_Louvor_e_adora%C3%A7%C3%A3o_%28Unsplash%29.jpg`,
    page: 'https://commons.wikimedia.org/wiki/File:Praise_and_Worship_-_Louvor_e_adora%C3%A7%C3%A3o_(Unsplash).jpg',
    photographer: 'Arthur Miranda',
    fallback: '/updates/sample-sunrise.svg',
  },
  study: {
    src: `${COMMONS}/6/69/Bible_Study_%28Unsplash%29.jpg/1280px-Bible_Study_%28Unsplash%29.jpg`,
    page: 'https://commons.wikimedia.org/wiki/File:Bible_Study_(Unsplash).jpg',
    photographer: 'Ben White',
    fallback: '/home-board/potluck.svg',
  },
  bible: {
    src: `${COMMONS}/3/3e/Holding_the_Bible_%28Unsplash%29.jpg/1280px-Holding_the_Bible_%28Unsplash%29.jpg`,
    page: 'https://commons.wikimedia.org/wiki/File:Holding_the_Bible_(Unsplash).jpg',
    photographer: 'Priscilla Du Preez',
    fallback: '/updates/sample-book.svg',
  },
  church: {
    src: `${COMMONS}/d/d4/The_Little_White_Church_%28Unsplash%29.jpg/1280px-The_Little_White_Church_%28Unsplash%29.jpg`,
    page: 'https://commons.wikimedia.org/wiki/File:The_Little_White_Church_(Unsplash).jpg',
    photographer: 'Peter Lewis',
    fallback: '/home-board/park.svg',
  },
  sunset: {
    src: `${COMMONS}/5/5c/Man_with_bible_sunset_%28Unsplash%29.jpg/1280px-Man_with_bible_sunset_%28Unsplash%29.jpg`,
    page: 'https://commons.wikimedia.org/wiki/File:Man_with_bible_sunset_(Unsplash).jpg',
    photographer: 'Priscilla Du Preez',
    fallback: '/home-board/hills.svg',
  },
  reading: {
    src: `${COMMONS}/e/e2/Open_book_in_sun_%28Unsplash%29.jpg/1280px-Open_book_in_sun_%28Unsplash%29.jpg`,
    page: 'https://commons.wikimedia.org/wiki/File:Open_book_in_sun_(Unsplash).jpg',
    photographer: 'Aaron Burden',
    fallback: '/updates/sample-book.svg',
  },
};

/** This app's address for one of them. */
export const samplePhoto = (id: keyof typeof SAMPLE_PHOTOS & string): string => `/api/updates/sample-photo?id=${id}`;
