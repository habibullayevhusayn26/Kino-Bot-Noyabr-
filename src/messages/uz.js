const { toPremiumEmojiMarkup } = require('../utils/premiumEmoji');

function escapeMessageHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  welcome: '👋 Assalomu alaykum, {name}! Kino kodini yuboring yoki menyudan tanlang.',
  menuSearch: '🔎 Kino qidirish',
  menuRetro: '⚽ Retro Futbol',
  menuGenres: '🎭 Janrlar',
  menuNew: '🆕 Yangi kinolar',
  menuTop: '🏆 Top kinolar',
  menuRandom: '🎲 Tasodifiy kino',
  menuFavorites: '❤️ Sevimlilarim',
  menuHelp: 'ℹ️ Yordam',
  searchPrompt: '🔎 Kino nomini yoki kodini yuboring.',
  searchResults: '🎬 “{query}” bo‘yicha {total} ta natija. Sahifa {page}.',
  newMovies: '🆕 Yangi kinolar',
  topMovies: '🏆 Top kinolar',
  favorites: '❤️ Sevimlilarim',
  relatedMovies: '🎬 O‘xshash kinolar',
  chooseGenre: '🎭 Janrni tanlang:',
  chooseMovieGenre: '🎭 Kino janrini tanlang:',
  addNewGenre: '➕ Yangi janr qo‘shish',
  enterNewGenre: '🎭 Yangi janr nomini kiriting:',
  retroTitle: '⚽ Retro Futbol',
  retroEmpty: '⚽ Hozircha retro futbol o‘yinlari yo‘q.',
  retroNotFound: '⚽ Bu kod bo‘yicha retro futbol o‘yini topilmadi.',
  retroGameCaption(game) {
    return `⚽ <b>${escapeMessageHtml(game.title)}</b>\n📅 Sana: ${escapeMessageHtml(game.date)}\n🆔 Kod: ${game.code}`;
  },
  adminRetroVideo: '⚽ 1/4. Retro o‘yin videosini yoki video faylini yuboring.',
  adminRetroInvalidMedia: '⚽ Video yoki video fayl yuboring.',
  adminRetroDate: '⚽ 2/4. O‘yin sanasini kiriting.',
  adminRetroTitle: '⚽ 3/4. Qaysi klublar o‘ynaganini kiriting.',
  adminRetroCode: '⚽ 4/4. Musbat va noyob o‘yin kodini kiriting.',
  adminRetroConfirm: '✅ Retro o‘yin ma’lumotlarini tasdiqlang:',
  adminRetroSave: '✅ Saqlash',
  adminRetroCancel: '❌ Bekor qilish',
  adminRetroSaved: '✅ Retro o‘yin saqlandi. Kodi: {code}',
  adminRetroSaveFailed: '⚽ Retro o‘yin saqlanmadi. Ma’lumotlarni tekshirib, qayta urinib ko‘ring.',
  adminRetroDuplicateCode: '⚽ Bu kod kino yoki boshqa o‘yinda ishlatilgan. Boshqa kod kiriting.',
  adminRetroStorageFailed:
    '⚽ O‘yin videosini saqlash kanaliga joylab bo‘lmadi. Saqlash kanalini tekshiring.',
  noGenres: 'ℹ️ Hozircha janrlar mavjud emas.',
  noMovies: '🔎 Kino topilmadi.',
  movieNotFound: '⚠️ Bu kod bo‘yicha kino topilmadi.',
  favoriteAdded: '❤️ Sevimlilarga qo‘shildi.',
  favoriteRemoved: '💔 Sevimlilardan olib tashlandi.',
  emptyFavorites: '📭 Sevimlilar ro‘yxatingiz hozircha bo‘sh.',
  helpText:
    'ℹ️ <b>Bot imkoniyatlari</b>\n\n' +
    '🎬 Kino kodi yoki nomi bilan qidiring.\n' +
    '🎭 Janr, 🆕 yangi, 🏆 top, 🎲 tasodifiy kinolar va ❤️ sevimlilar ro‘yxatidan foydalaning.\n' +
    '❤️ Kerakli kino kartasida sevimlilarga qo‘shish/o‘chirish funksiyasi bor.\n' +
    '📢 Majburiy kanallarga obuna bo‘lishingiz shart bo‘lishi mumkin.',
  noAccess: '⛔ Bu amal uchun ruxsatingiz yo‘q.',
  adminAddMovieMedia: '🎬 1/7. Videoni yuboring yoki saqlash kanalidan forward qiling.',
  adminAddMovieInvalidMedia: '⚠️ Video yoki video fayl yuboring.',
  adminAddMovieTitle: '🏷️ 2/7. Kino nomini kiriting.',
  adminAddMovieGenre: '🎭 3/7. Janrni kiriting.',
  adminAddMovieYear: '🗓️ 4/7. Chiqqan yilini kiriting.',
  adminAddMovieLanguage: '🗣️ 5/7. Kino tilini kiriting.',
  adminAddMovieQuality: '📺 6/7. Sifatini kiriting (masalan, 1080p).',
  adminAddMovieDescription: '📝 7/7. Tavsifini yuboring yoki “-” deb yozing.',
  adminAddMovieStorageFailed:
    '⚠️ Videoni saqlash kanaliga joylab bo‘lmadi. Avval admin paneldan saqlash kanalini tanlang, so‘ng botning admin huquqini tekshiring.',
  adminAddMovieInvalidYear: '⚠️ Yil 1888 dan boshlab raqam bo‘lishi kerak. Qayta kiriting.',
  adminMovieDescriptionTooLong: '⚠️ Tavsif 4000 belgidan oshmasligi kerak.',
  adminAddMovieConfirm:
    '✅ Tasdiqlang\n🆔 Kod: {code} (avto)\n🎬 Nom: {title}\n🎭 Janr: {genre}\n🗓️ Yil: {year}\n🗣️ Til: {language}\n📺 Sifat: {quality}',
  adminAddMovieSave: '✅ Saqlash',
  adminAddMovieCancel: '❌ Bekor qilish',
  adminMovieSaved: '✅ Kino saqlandi. Kodi: {code}',
  adminMovieSaveFailed: '⚠️ Kino saqlanmadi. Ma’lumotlarni tekshirib, qayta urinib ko‘ring.',
  adminMovies: '📚 Kinolar ro‘yxati',
  adminMovieNotFound: '🔎 Kino topilmadi.',
  adminMovieActions: '🎬 Kino: {code} — {title}\n👁 Ko‘rilgan: {views}',
  adminMovieEdit: '✏️ Tahrirlash',
  adminMovieChangeCode: '🆔 Kodni o‘zgartirish',
  adminMovieDelete: '🗑 O‘chirish',
  adminMovieDeleteConfirm: '⚠️ “{title}” kinoni o‘chirishni tasdiqlaysizmi?',
  adminMovieDeleted: '🗑 Kino o‘chirildi.',
  adminMovieEditPrompt: '✏️ {field} uchun yangi qiymatni yuboring.',
  adminMovieEditSaved: '✅ Kino ma’lumoti yangilandi.',
  adminMovieCodePrompt: '🆔 Yangi musbat va unikal kino kodini yuboring.',
  adminMovieCodeChanged: '✅ Kino kodi o‘zgartirildi: {code}',
  adminMovieDuplicateCode: '⚠️ Bu kod boshqa kinoda ishlatilgan. Boshqa kod kiriting.',
  adminMovieEditFields: '✏️ Tahrirlanadigan maydonni tanlang:',
  adminMovieFieldTitle: '🏷️ Nom',
  adminMovieFieldGenre: '🎭 Janr',
  adminMovieFieldYear: '🗓️ Yil',
  adminMovieFieldLanguage: '🗣️ Til',
  adminMovieFieldQuality: '📺 Sifat',
  adminMovieFieldDescription: '📝 Tavsif',
  adminMovieFieldMedia: '🎬 Video',
  adminMovieEditMedia: '🎬 Yangi video yoki video-fayl yuboring.',
  adminMovieDeleteConfirmButton: '🗑 Ha, o‘chirish',
  adminUsers: '👤 Foydalanuvchilar',
  adminUserLookupPrompt: '🔎 Foydalanuvchining Telegram ID raqamini yuboring.',
  adminUserNotFound: '🔎 Foydalanuvchi topilmadi.',
  adminUserDetails: '👤 Foydalanuvchi: {name}\n🆔 ID: {id}\n📌 Holat: {status}',
  adminUserBanned: '⛔ bloklangan',
  adminUserActive: '✅ faol',
  adminUserBan: '⛔ Bloklash',
  adminUserUnban: '✅ Blokdan chiqarish',
  adminUserUpdated: '✅ Foydalanuvchi holati yangilandi.',
  adminChannelRemoved: '🗑 Majburiy obuna kanali o‘chirildi.',
  adminChannelListEmpty: '📭 Majburiy obuna kanallari yo‘q.',
  adminChooseRequiredChat: '📣 Majburiy obuna uchun kanal yoki guruhni tanlang:',
  adminChooseStorageChannel: '📦 Kino va media saqlash uchun yopiq kanalni tanlang:',
  adminPickChannel: '📢 Kanalni tanlash',
  adminPickGroup: '👥 Guruhni tanlash',
  adminStorageChannelSaved: '✅ Saqlash kanali tanlandi: {title}',
  adminRequiredChatAdded: '✅ {title} majburiy obuna chatiga qo‘shildi.',
  adminCancelPicker: '❌ Bekor qilish',
  adminPickerCancelled: '↩️ Chat tanlash bekor qilindi.',
  adminStorageNotConfigured:
    '⚠️ Avval admin paneldagi “📦 Saqlash kanalini tanlash” tugmasi orqali kanal sozlang.',
  adminChatSharedFailed:
    '⚠️ Chatni ulab bo‘lmadi. Chatda administrator ekaningizni va bot admin huquqini olganini tekshiring.',
  channelNotChannel: '⚠️ Bu tanlov Telegram kanali yoki guruhiga tegishli emas.',
  channelAdminRequired: '⛔ Kanalni qo‘shish uchun unda administrator yoki ega bo‘lishingiz kerak.',
  channelBotAdminRequired:
    '⚠️ Majburiy obunani tekshirish uchun bot kanal administratoriga qo‘shilishi kerak.',
  channelInviteLinkFailed: '⚠️ Yopiq kanal uchun taklif havolasini yaratib bo‘lmadi: {error}',
  adminStatsTitle: '📊 Bot statistikasi',
  adminStatsUsers:
    '👥 Jami foydalanuvchilar: {total}\n🟢 Faol (24 soat): {day}\n🗓️ Faol (7 kun): {week}\n🗓️ Faol (30 kun): {month}',
  adminStatsMovies: '🎬 Jami kinolar: {total}',
  adminStatsNewUsers: '🆕 Yangi foydalanuvchilar (kunlar bo‘yicha):',
  adminStatsTopMovies: '🏆 Top 10 kino:',
  banned: '⛔ Botdan foydalanishingiz vaqtincha cheklangan. Administratorga murojaat qiling.',
  rateLimited: '⏳ Juda tez so‘rov yuboryapsiz. Biroz kutib, qayta urinib ko‘ring.',
  subscriptionRequired: '📢 Botdan foydalanish uchun quyidagi kanallarga obuna bo‘ling.',
  subscriptionCheckFailed:
    '⚠️ Obunani tekshirishda xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.',
  genericError: '⚠️ Texnik xatolik yuz berdi. Iltimos, qaytadan urinib ko‘ring.',
  movieCaption(movie, views) {
    const escapeHtml = (value) =>
      String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const caption = [
      `🎬 ${movie.title}`,
      `🆔 Kod: ${movie.code} | 🗓️ Yil: ${movie.year} | 🎭 Janr: ${movie.genre}`,
      `🗣️ Til: ${movie.language} | 📺 Sifat: ${movie.quality}`,
      `👁 Ko‘rilgan: ${views}`,
      movie.description ? `\n${movie.description}` : ''
    ].join('\n');
    const limitedCaption = Array.from(caption).slice(0, 1024).join('');
    return toPremiumEmojiMarkup(escapeHtml(limitedCaption));
  }
};
