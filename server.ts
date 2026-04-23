import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("cecado.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category_id TEXT,
    image_url TEXT,
    stock INTEGER DEFAULT 0,
    FOREIGN KEY (category_id) REFERENCES categories (id)
  );

  CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    latitude REAL,
    longitude REAL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    status TEXT DEFAULT 'pending',
    total REAL,
    payment_method TEXT,
    type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    product_id TEXT,
    quantity INTEGER,
    price REAL,
    FOREIGN KEY (order_id) REFERENCES orders (id),
    FOREIGN KEY (product_id) REFERENCES products (id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    address TEXT,
    role TEXT DEFAULT 'client',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed initial data if empty
const categoryCount = db.prepare("SELECT count(*) as count FROM categories").get() as { count: number };
if (categoryCount.count === 0) {
  const insertCategory = db.prepare("INSERT INTO categories (id, name, icon) VALUES (?, ?, ?)");
  insertCategory.run(nanoid(), "Fruits & Légumes", "Apple");
  insertCategory.run(nanoid(), "Boucherie", "Beef");
  insertCategory.run(nanoid(), "Produits Laitiers", "Milk");
  insertCategory.run(nanoid(), "Épicerie", "Coffee");
  insertCategory.run(nanoid(), "Boissons", "GlassWater");
  insertCategory.run(nanoid(), "Hygiène & Beauté", "Sparkle");
}

const productCount = db.prepare("SELECT count(*) as count FROM products").get() as { count: number };
if (productCount.count === 0) {
  const categories = db.prepare("SELECT id, name FROM categories").all() as { id: string, name: string }[];
  const insertProduct = db.prepare("INSERT INTO products (id, name, description, price, category_id, image_url, stock) VALUES (?, ?, ?, ?, ?, ?, ?)");
  
  categories.forEach(cat => {
    insertProduct.run(nanoid(), `Produit de qualité ${cat.name}`, `Excellent produit sélectionné pour vous.`, Math.floor(Math.random() * 5000) + 500, cat.id, "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80", 100);
  });
}

const storeCount = db.prepare("SELECT count(*) as count FROM stores").get() as { count: number };
if (storeCount.count === 0) {
  const insertStore = db.prepare("INSERT INTO stores (id, name, address, latitude, longitude) VALUES (?, ?, ?, ?, ?)");
  insertStore.run(nanoid(), "CECADO Libreville", "Centre-ville, Libreville", 0.3924, 9.4537);
  insertStore.run(nanoid(), "CECADO Port-Gentil", "Quartier chic, Port-Gentil", -0.722, 8.783);
}

// Seed admin user
const adminCount = db.prepare("SELECT count(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
if (adminCount.count === 0) {
  const hashedPassword = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (id, email, password, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, ?)")
    .run(nanoid(), "admin@cecado.ga", hashedPassword, "Admin", "CECADO", "admin");
}

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_dev";

// Middleware to protect routes
const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access denied. No token provided." });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    (req as any).user = user;
    next();
  });
};

const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if ((req as any).user?.role !== 'admin') {
    return res.status(403).json({ error: "Access denied. Admin only." });
  }
  next();
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.get("/api/categories", (req, res) => {
    const categories = db.prepare("SELECT * FROM categories").all();
    res.json(categories);
  });

  app.get("/api/products", (req, res) => {
    const { categoryId } = req.query;
    let products;
    if (categoryId) {
      products = db.prepare("SELECT * FROM products WHERE category_id = ?").all(categoryId);
    } else {
      products = db.prepare("SELECT * FROM products").all();
    }
    res.json(products);
  });

  app.get("/api/products/:id", (req, res) => {
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    if (product) res.json(product);
    else res.status(404).json({ error: "Product not found" });
  });

  app.get("/api/stores", (req, res) => {
    const stores = db.prepare("SELECT * FROM stores").all();
    res.json(stores);
  });

  // Auth Routes
  app.post("/api/auth/register", (req, res) => {
    const { email, password, firstName, lastName, phone, address } = req.body;
    try {
      const hashedPassword = bcrypt.hashSync(password, 10);
      const userId = nanoid();
      db.prepare("INSERT INTO users (id, email, password, first_name, last_name, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(userId, email, hashedPassword, firstName, lastName, phone, address);
      
      const token = jwt.sign({ id: userId, email, role: 'client' }, JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({ token, user: { id: userId, email, firstName, lastName, role: 'client' } });
    } catch (error) {
      if ((error as any).code === 'SQLITE_CONSTRAINT') {
        res.status(400).json({ error: "Cet email est déjà utilisé." });
      } else {
        res.status(500).json({ error: "Failed to register" });
      }
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;

    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ 
        token, 
        user: { 
          id: user.id, 
          email: user.email, 
          firstName: user.first_name, 
          lastName: user.last_name, 
          role: user.role,
          phone: user.phone,
          address: user.address
        } 
      });
    } else {
      res.status(401).json({ error: "Email ou mot de passe incorrect." });
    }
  });

  app.get("/api/auth/me", authenticateToken, (req, res) => {
    const user = db.prepare("SELECT id, email, first_name as firstName, last_name as lastName, phone, address, role FROM users WHERE id = ?")
      .get((req as any).user.id);
    res.json(user);
  });

  app.get("/api/orders/my", authenticateToken, (req, res) => {
    const orders = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC")
      .all((req as any).user.id);
    res.json(orders);
  });

  // Admin Routes
  app.get("/api/admin/users", authenticateToken, isAdmin, (req, res) => {
    const users = db.prepare("SELECT id, email, first_name, last_name, role, created_at FROM users").all();
    res.json(users);
  });

  app.post("/api/orders", (req, res) => {
    const { items, total, paymentMethod, type, userId } = req.body;
    const orderId = nanoid();
    
    const insertOrder = db.prepare("INSERT INTO orders (id, user_id, total, payment_method, type) VALUES (?, ?, ?, ?, ?)");
    const insertItem = db.prepare("INSERT INTO order_items (id, order_id, product_id, quantity, price) VALUES (?, ?, ?, ?, ?)");
    
    const transaction = db.transaction(() => {
      insertOrder.run(orderId, userId || "guest", total, paymentMethod, type);
      for (const item of items) {
        insertItem.run(nanoid(), orderId, item.id, item.quantity, item.price);
      }
    });

    try {
      transaction();
      res.status(201).json({ id: orderId, message: "Order placed successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to place order" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
