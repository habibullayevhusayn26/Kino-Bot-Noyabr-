const customEmojis = Object.freeze({
  '↩️': '5280815414606075365',
  '⏳': '5451732530048802485',
  '⚙️': '5258096772776991776',
  '⚠️': '5393289832015359590',
  '⚡️': '5393318303353563978',
  '⛔️': '5229108037041553482',
  '✅': '5971815857997750999',
  '✏️': '5395444784611480792',
  '✔️': '5393275607083676065',
  '❌': '5391126096211110962',
  '❤️': '5449505950283078474',
  '➕': '5258108352008823107',
  '➡️': '5323481160163041855',
  '⬅️': '5323454338092280794',
  '🌐': '5974475701179387553',
  '🎨': '5431456208487716895',
  '🎬': '5375464961822695044',
  '🎭': '5359441070201513074',
  '🎲': '5974411534367989550',
  '🏆': '5283273974145391195',
  '🏷': '5296348778012361146',
  '👁': '5974350313904147369',
  '👋': '6008263495932448198',
  '👤': '5278570220452091808',
  '👥': '6001526766714227911',
  '💔': '5471954395719539651',
  '💚': '5449380056201697322',
  '💬': '5393314064220843793',
  '📊': '5460939698685898828',
  '📋': '5974423955413409429',
  '📌': '5974352611711651172',
  '📚': '5373098009640836781',
  '📝': '5334882760735598374',
  '📢': '5972335630644943766',
  '📣': '5260268501515377807',
  '📤': '5974192980662160632',
  '📦': '5258134813302332906',
  '📭': '5352896944496728039',
  '📺': '5373330964372004748',
  '🔎': '5976655487276421359',
  '🔐': '5472308992514464048',
  '🔒': '6003424016977628379',
  '🔗': '5393243708361567810',
  '🔴': '5393257868868744252',
  '🔵': '5231031220317484418',
  '🖼': '5974563790958627920',
  '🗑': '5974518878485615140',
  '🗓': '5974092143419985273',
  '🗣': '5190799510036567822',
  '🤖': '5971808079811972376',
  '🚪': '5974506040828366250',
  '🛠': '5215392879320505675',
  '🟢': '5393585776736889461',
  ℹ️: '5258503720928288433',
  '🆔': '5280783172286582731',
  '🆕': '4918438965029110683'
});

const customEmojisByNormalizedForm = new Map(
  Object.entries(customEmojis).map(([emoji, id]) => [normalizeEmoji(emoji), { emoji, id }])
);
const customEmojiMarkupPattern = /(<tg-emoji\b[^>]*>[\s\S]*?<\/tg-emoji>)/gi;
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

function normalizeEmoji(value) {
  return value.replace(/\uFE0F/g, '');
}

function findCustomEmoji(value) {
  for (const { segment } of segmenter.segment(String(value || ''))) {
    const match = customEmojisByNormalizedForm.get(normalizeEmoji(segment));
    if (match) return { ...match, matchedText: segment };
  }
  return null;
}

function toPremiumEmojiMarkup(value) {
  return String(value || '')
    .split(customEmojiMarkupPattern)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return [...segmenter.segment(part)]
        .map(({ segment }) => {
          const match = customEmojisByNormalizedForm.get(normalizeEmoji(segment));
          return match ? `<tg-emoji emoji-id="${match.id}">${match.emoji}</tg-emoji>` : segment;
        })
        .join('');
    })
    .join('');
}

module.exports = { findCustomEmoji, toPremiumEmojiMarkup };
