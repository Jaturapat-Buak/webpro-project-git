const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dbPath = path.join(__dirname, 'hardwarehouse.db');
let db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Database connection error:", err.message);
    else console.log('Connected to database.');
});

app.get('/', (req, res) => {
    const stats = { total: 107, received: 56, dispatched: 34, lowStock: 3 };
    res.render('dashboard', { title: 'แดชบอร์ด', stats, currentRoute: '/' });
});

app.get('/products', (req, res) => {
    const search = req.query.search || '';
    const categoryId = req.query.category || '';

    db.all("SELECT category_id, category_name FROM categories ORDER BY category_id ASC", [], (err, categories) => {
        if (err) return res.status(500).send("Database Error (Categories)");

        let sql = `
            SELECT 
                p.product_id, 
                p.product_name, 
                p.price, 
                c.category_name, 
                COALESCE(s.warehouse_qty, 0) AS stock 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            LEFT JOIN stock s ON p.product_id = s.product_id
            WHERE 1=1
        `;
        let params = [];

        if (search) {
            sql += " AND p.product_name LIKE ?";
            params.push('%' + search + '%');
        }
        if (categoryId) {
            sql += " AND p.category_id = ?";
            params.push(categoryId);
        }

        sql += "ORDER BY p.category_id ASC, p.product_id ASC";

        db.all(sql, params, (err, rows) => {
            if (err) return res.status(500).send("Database Error (Products)");
            
            res.render('products', { 
                title: 'สินค้าทั้งหมด', 
                products: rows, 
                categories: categories, 
                searchQuery: search,    
                selectedCategory: categoryId, 
                currentRoute: '/products' 
            });
        });
    });
});

app.post('/add-product', (req, res) => {
    const { name, category_id, stock, price, description } = req.body;

    db.get("SELECT MAX(product_id) as maxId FROM products", (err, row) => {
        if (err) return res.status(500).send("Database Error");
        
        const nextId = (row && row.maxId) ? row.maxId + 1 : 1;

        const insertProductSql = `INSERT INTO products (product_id, product_name, category_id, price, description) VALUES (?, ?, ?, ?, ?)`;
        db.run(insertProductSql, [nextId, name, category_id, price, description], function(err) {
            if (err) return res.status(500).send("ไม่สามารถเพิ่มสินค้าได้");

            const insertStockSql = `INSERT INTO stock (product_id, warehouse_qty) VALUES (?, ?)`;
            db.run(insertStockSql, [nextId, stock], function(err) {
                if (err) console.error("Stock insert error:", err.message);
                res.redirect('/products');
            });
        });
    });
});

app.post('/delete-products', (req, res) => {
    const { ids } = req.body; 
    if (!ids || ids.length === 0) return res.status(400).json({ success: false, message: "ไม่มีข้อมูลที่ต้องการลบ" });

    const placeholders = ids.map(() => '?').join(',');

    db.run(`DELETE FROM stock WHERE product_id IN (${placeholders})`, ids, function(err) {
        if (err) return res.status(500).json({ success: false, message: "ลบสต็อกไม่สำเร็จ" });

        db.run(`DELETE FROM products WHERE product_id IN (${placeholders})`, ids, function(err) {
            if (err) return res.status(500).json({ success: false, message: "ลบสินค้าไม่สำเร็จ" });
            
            res.json({ success: true, message: "ลบข้อมูลเรียบร้อยแล้ว" });
        });
    });
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});