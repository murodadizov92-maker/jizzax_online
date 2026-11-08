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
