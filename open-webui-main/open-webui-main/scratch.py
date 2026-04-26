import sqlite3
db_path = r'h:\uncensored\open-webui-main\open-webui-main\backend\data\webui.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute("SELECT id, name, email FROM user")
for r in cur.fetchall():
    print(dict(r))
