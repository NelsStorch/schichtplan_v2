import { describe, expect, it } from 'vitest';
import { detectImageType, unsafeSvgReason } from './imageUpload.js';

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const jpeg = Buffer.from('ffd8ffe000104a464946', 'hex');
const gif = Buffer.from('GIF89a\x01\x00\x01\x00', 'binary');
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

describe('detectImageType', () => {
  it('erkennt Rasterbilder am Inhalt', () => {
    expect(detectImageType(png)).toBe('image/png');
    expect(detectImageType(jpeg)).toBe('image/jpeg');
    expect(detectImageType(gif)).toBe('image/gif');
    expect(detectImageType(webp)).toBe('image/webp');
  });

  it('erkennt SVG auch mit XML-Deklaration und Kommentar', () => {
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('image/svg+xml');
    expect(detectImageType(Buffer.from('<?xml version="1.0"?>\n<!-- Logo -->\n<svg></svg>'))).toBe('image/svg+xml');
  });

  it('lehnt andere Inhalte ab, auch wenn sie als Bild getarnt sind', () => {
    expect(detectImageType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(detectImageType(Buffer.from('MZ\x90\x00', 'binary'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('unsafeSvgReason', () => {
  it('lässt einfache Grafiken zu', () => {
    const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="10" height="10"/><image href="data:image/png;base64,AAAA"/><use href="#g"/></svg>';
    expect(unsafeSvgReason(ok)).toBeNull();
  });

  it.each([
    ['<svg><script>alert(1)</script></svg>'],
    ['<svg onload="alert(1)"></svg>'],
    ['<svg><a href="javascript:alert(1)"><text>x</text></a></svg>'],
    ['<svg><foreignObject><div>x</div></foreignObject></svg>'],
    ['<svg><image href="https://evil.example/x.png"/></svg>'],
    ['<svg><image href=\'https://evil.example/x.png\'/></svg>'],
    ['<svg><image href=https://evil.example/x.png/></svg>'],
    ['<svg><style>@import "https://evil.example/x.css";</style></svg>'],
    ['<svg><rect style="fill:url(https://evil.example/x)"/></svg>'],
    ['<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>'],
  ])('weist %s ab', (svg) => {
    expect(unsafeSvgReason(svg)).not.toBeNull();
  });
});
