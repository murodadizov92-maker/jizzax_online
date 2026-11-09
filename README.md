# MeatCity Jizzax — Online zakas (3D Mini App)

## Render'ga qo'yish (YANGI alohida servis — asosiy zakas_bot'ga tegmaydi)
Build: `pip install -r requirements.txt`   Start: `python server.py`

Environment o'zgaruvchilar:
| Nomi | Nima |
|---|---|
| BOT_TOKEN | BotFather'dagi YANGI test bot tokeni |
| ADMIN_IDS | Sizning Telegram ID'ingiz (vergul bilan bir nechta) |
| CHAT_ID | Test guruh ID (-100...) |
| TOPIC_ID | Test topik ID (message_thread_id) |
| APP_LINK | https://t.me/<bot>/<app>  (BotFather → /newapp, URL = Render manzili) |
| PRODUCTS_URL | zakas bot'ning mahsulotlar JSON manzili (narx, rasm shu yerdan olinadi) |
| PRODUCTS_TOKEN | kerak bo'lsa (Bearer) |
| DB_PATH | Render Disk ulangan bo'lsa: /data/online.db |

Guruh topigida `/panel` yozing — bot "Online zakas'ni ochish" tugmasini yuboradi (uni pin qiling).
UptimeRobot: `https://<render-manzil>/health` ni 5 daqiqada bir chaqirsin.

## Mijozlar bazasi
Ilovada ⚙️ Admin → Excel yuklash. Ustunlar: Клиент/Nom, Телефон, Район/Shahar, Адрес.
Hudud (masalan "Paxtakor shahar") bo'yicha chip-filtr; tanlangan hudud eslab qolinadi.

## Topikda tugma (pin)
Bot guruhda admin bo'lsin (xabarni pin qilish va o'chirish huquqi bilan).
Topikda ADMIN_IDS dagi odam `/panel` yozsa: bot tugmali xabarni yuboradi, pin qiladi va buyruqni o'chiradi.
Topikka oddiy a'zolar yozolmasligi uchun: topikni tahrirlab "faqat adminlar yozadi" qiling.

## Mahsulotlar (zakas bot bilan sinxron)
Render → Environment: `DATABASE_URL` = zakas bot servisidagi AYNAN SHU nom/qiymat (Supabase bazasi). Ilova faqat o'qiydi (select).
Narx/rasm/kategoriya zakas bot admin panelida o'zgarsa, ~45 soniyada bu yerda ham yangilanadi.


## Sklad qoldig'i (ostatka) va kg/dona
- Render env: `SD_LOGIN`, `SD_PASSWORD` (Sales Doctor), ixtiyoriy `SD_DOMAIN` (standart aslbarakadzk.salesdoc.io), `SD_WAREHOUSE` (faqat shu sklad), `SD_STOCK_METHOD`, `SD_INTERVAL` (soniya, standart 600).
- Admin → "Sklad qoldig'i": «Sales Doctor'dan olish» yoki Excel (ustunlar: Наименование, Остаток, ixtiyoriy Ед.) yuklash.
- Qoldiq yetmasa ham zakas yoziladi; tasdiqlash sahifasida "Yetmaydigan mahsulotlar" jadvali va har biriga izoh maydoni chiqadi, guruhga xabarda ham ⚠️ bilan ko'rsatiladi.
- Admin mahsulot kartochkasidagi «dona/kg» tugmasi bilan birlikni belgilaydi (kg uchun qadam 0,5).
- «Aa» tugmasi: katta/oddiy yozuv (standart — katta).
