import React, { createContext, useContext, useState, useEffect } from 'react';
import { ShoppingCart, Search, Menu, User as UserIcon, MapPin, ChevronRight, ArrowLeft, Plus, Minus, X, Check, CreditCard, Smartphone, Store as StoreIcon, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Category, Product, Store, CartItem, PaymentMethod, OrderType, User, Order } from './types';
import { formatPrice, cn } from './lib/utils';
import { toast, Toaster } from 'react-hot-toast';
import { auth, db, handleFirestoreError } from './lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  orderBy,
  serverTimestamp,
  addDoc
} from 'firebase/firestore';

// --- Contexts ---

const AppContext = createContext<{
  cart: CartItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, delta: number) => void;
  clearCart: () => void;
  selectedStore: Store | null;
  setSelectedStore: (store: Store) => void;
  user: User | null;
  logout: () => void;
} | null>(null);

const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};

// --- API Helpers ---

const API_BASE = '/api';

const fetchData = async (path: string, token?: string | null) => {
  const headers: any = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error('Fetch failed');
  return res.json();
};

// --- Components ---

const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const { addToCart } = useAppContext();
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl hover:shadow-gray-200/50 hover:-translate-y-1 transition-all duration-300 group"
    >
      <div className="relative aspect-square overflow-hidden bg-gray-50">
        <img 
          src={product.image_url} 
          alt={product.name} 
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <button 
          onClick={() => {
            addToCart(product);
            toast.success(`${product.name} ajouté !`, {
              icon: '🛒',
              style: { borderRadius: '1rem', fontWeight: 'bold' }
            });
          }}
          className="absolute bottom-4 right-4 p-3 bg-primary text-white rounded-2xl shadow-xl shadow-red-200 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 active:scale-90"
        >
          <Plus size={20} />
        </button>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-1 text-[9px] font-black uppercase text-gray-400 tracking-widest mb-2">
          <StoreIcon size={10} />
          <span>CECADO Drive</span>
        </div>
        <h3 className="font-bold text-sm text-gray-900 line-clamp-2 h-10 mb-3 leading-tight">{product.name}</h3>
        <div className="flex items-center justify-between">
          <span className="font-black text-lg text-gray-900 tracking-tighter">{formatPrice(product.price)}</span>
          <span className="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full">En stock</span>
        </div>
      </div>
    </motion.div>
  );
};

const CartSidebar = ({ isOpen, onClose, onCheckout }: { isOpen: boolean, onClose: () => void, onCheckout: () => void }) => {
  const { cart, updateQuantity, removeFromCart } = useAppContext();
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-gray-900/60 z-50 backdrop-blur-md"
          />
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-[#F3F4F6] z-[60] shadow-2xl flex flex-col"
          >
            <div className="p-6 bg-white border-b flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tighter">Mon Panier</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{cart.length} articles sélectionnés</p>
              </div>
              <button 
                onClick={onClose} 
                className="p-3 hover:bg-gray-100 rounded-2xl transition-colors text-gray-400 hover:text-gray-900"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {cart.length === 0 ? (
                <div className="text-center py-32">
                  <div className="w-24 h-24 bg-white rounded-[2rem] shadow-inner flex items-center justify-center mx-auto mb-6 text-gray-200">
                    <ShoppingCart size={40} />
                  </div>
                  <h3 className="font-bold text-lg text-gray-400">Votre panier est vide</h3>
                  <p className="text-sm text-gray-300 mt-2">Commencez vos courses chez CECADO</p>
                </div>
              ) : (
                cart.map(item => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={item.id} 
                    className="flex gap-4 p-4 bg-white rounded-[1.5rem] shadow-sm border border-gray-100 relative group"
                  >
                    <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gray-50 shrink-0">
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm text-gray-900 line-clamp-1 pr-6">{item.name}</h4>
                      <p className="text-secondary font-black text-md mt-1 tracking-tighter">{formatPrice(item.price)}</p>
                      
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center bg-gray-100 rounded-xl p-1">
                          <button 
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white transition-all text-gray-500 hover:text-primary"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center font-black text-sm">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white transition-all text-gray-500 hover:text-primary"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.id)}
                      className="absolute top-4 right-4 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X size={18} />
                    </button>
                  </motion.div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-8 bg-white border-t rounded-t-[2.5rem] shadow-2xl shadow-black/10">
                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between text-sm text-gray-500 font-medium">
                    <span>Sous-total</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-500 font-medium">
                    <span>Livraison</span>
                    <span className="text-green-600 font-bold uppercase tracking-widest text-[10px]">Gratuit</span>
                  </div>
                  <div className="flex items-center justify-between text-xl font-black text-gray-900 pt-2 border-t border-gray-50">
                    <span>Total</span>
                    <span className="tracking-tighter">{formatPrice(subtotal)}</span>
                  </div>
                </div>
                
                <button 
                  onClick={() => {
                    onCheckout();
                    onClose();
                  }}
                  className="w-full py-5 bg-primary text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl shadow-red-100 hover:bg-primary/90 transition-all active:scale-95"
                >
                  Valider ma commande <ChevronRight size={20} />
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// --- Main App Implementation ---

export default function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // App State (simple implementation, would use a better provider in real app)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            setUser({ ...userData, id: firebaseUser.uid });
            
            // Fetch orders
            const ordersQuery = query(
              collection(db, 'orders'), 
              where('userId', '==', firebaseUser.uid),
              orderBy('createdAt', 'desc')
            );
            const ordersSnap = await getDocs(ordersQuery);
            setOrders(ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));

            if (userData.role === 'admin') {
              const usersSnap = await getDocs(collection(db, 'users'));
              setAdminUsers(usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            }
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        }
      } else {
        setUser(null);
        setOrders([]);
        setAdminUsers([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      setView('home');
      toast.success("Déconnexion réussie");
    } catch (e) {
      toast.error("Erreur lors de la déconnexion");
    }
  };

  useEffect(() => {
    fetchData('/categories').then(setCategories);
    fetchData('/stores').then(data => {
      setStores(data);
      if (data.length > 0) setSelectedStore(data[0]);
    });
  }, []);

  useEffect(() => {
    const path = selectedCategory ? `/products?categoryId=${selectedCategory}` : '/products';
    fetchData(path).then(setProducts);
  }, [selectedCategory]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const clearCart = () => setCart([]);

  const contextValue = {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    selectedStore,
    setSelectedStore,
    user,
    logout
  };

  const [view, setView] = useState<'home' | 'checkout' | 'success' | 'auth' | 'profile' | 'admin'>('home');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [orderId, setOrderId] = useState<string | null>(null);

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  const handleCheckoutClick = () => {
    if (!user) {
      setAuthMode('login');
      setView('auth');
      toast("Veuillez vous connecter pour commander", { icon: '🔐' });
    } else {
      setView('checkout');
    }
  };

  const handlePlaceOrder = async (paymentMethod: PaymentMethod, type: OrderType) => {
    if (!user) return toast.error("Connectez-vous pour commander");

    try {
      const orderData = {
        userId: user.id,
        items: cart,
        total: subtotal,
        paymentMethod,
        type,
        status: 'pending',
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'orders'), orderData);
      setOrderId(docRef.id);
      setView('success');
      clearCart();
      toast.success("Commande enregistrée !");

      // Refresh orders list
      const ordersQuery = query(
        collection(db, 'orders'), 
        where('userId', '==', user.id),
        orderBy('createdAt', 'desc')
      );
      const ordersSnap = await getDocs(ordersQuery);
      setOrders(ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));

    } catch (e) {
      handleFirestoreError(e, 'create', 'orders');
    }
  };

  const [authFormData, setAuthFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    address: ''
  });

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, authFormData.email, authFormData.password);
        toast.success("Bon retour !");
        setView('profile'); // Redirect to profile (users page) after login
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, authFormData.email, authFormData.password);
        const firebaseUser = userCredential.user;
        
        const userData = {
          email: authFormData.email,
          firstName: authFormData.firstName,
          lastName: authFormData.lastName,
          phone: authFormData.phone,
          address: authFormData.address,
          role: 'client',
          createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'users', firebaseUser.uid), userData);
        
        // Force logout after registration to redirect to login page
        await signOut(auth);
        setAuthMode('login');
        toast.success("Compte créé ! Veuillez vous connecter.");
      }
    } catch (e: any) {
      toast.error(e.message || "Erreur d'authentification");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 font-black text-primary tracking-tighter">CHARGEMENT CECADO...</p>
      </div>
    );
  }

  if (view === 'auth') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <header className="fixed top-0 left-0 w-full p-6 flex justify-between items-center bg-white/80 backdrop-blur-md">
          <button onClick={() => setView('home')} className="p-2 hover:bg-gray-100 rounded-full">
            <ArrowLeft size={24} />
          </button>
          <div className="text-2xl font-black text-primary tracking-tighter">CECADO</div>
          <div className="w-10"></div>
        </header>

        <div className="w-full max-w-sm space-y-8 mt-20">
          <div className="text-center">
            <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tight">
              {authMode === 'login' ? 'Connexion' : 'Créer un compte'}
            </h1>
            <p className="text-gray-500 mt-2">
              {authMode === 'login' ? 'Heureux de vous revoir chez CECADO' : 'Rejoignez la communauté CECADO pour plus d\'avantages'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'register' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest pl-2">Prénom</label>
                  <input 
                    required
                    type="text" 
                    placeholder="Jean"
                    className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary/20"
                    value={authFormData.firstName}
                    onChange={e => setAuthFormData({...authFormData, firstName: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest pl-2">Nom</label>
                  <input 
                    required
                    type="text" 
                    placeholder="Dupont"
                    className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary/20"
                    value={authFormData.lastName}
                    onChange={e => setAuthFormData({...authFormData, lastName: e.target.value})}
                  />
                </div>
              </div>
            )}

            {authMode === 'register' && (
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest pl-2">Téléphone</label>
                <input 
                  required
                  type="tel" 
                  placeholder="077 00 00 00"
                  className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary/20"
                  value={authFormData.phone}
                  onChange={e => setAuthFormData({...authFormData, phone: e.target.value})}
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest pl-2">Email</label>
              <input 
                required
                type="email" 
                placeholder="jean@exemple.com"
                className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary/20"
                value={authFormData.email}
                onChange={e => setAuthFormData({...authFormData, email: e.target.value})}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest pl-2">Mot de passe</label>
              <input 
                required
                type="password" 
                placeholder="••••••••"
                className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary/20"
                value={authFormData.password}
                onChange={e => setAuthFormData({...authFormData, password: e.target.value})}
              />
            </div>

            <button 
              type="submit"
              className="w-full py-5 bg-primary text-white rounded-2xl font-black shadow-xl shadow-red-100 hover:bg-primary/90 transition-all active:scale-95"
            >
              {authMode === 'login' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>

          <div className="text-center">
            <button 
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="text-sm font-bold text-gray-400 hover:text-primary transition-colors"
            >
              {authMode === 'login' ? "Pas encore de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'profile') {
    return (
      <AppContext.Provider value={contextValue}>
        <div className="min-h-screen bg-gray-50 flex">
          {/* Sidebar logic reused or simplified */}
          <main className="flex-1 max-w-4xl mx-auto p-4 sm:p-8 space-y-8">
            <header className="flex items-center justify-between">
              <button onClick={() => setView('home')} className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100 text-gray-400 hover:text-gray-900 transition-colors">
                <ArrowLeft size={20} />
              </button>
              <h1 className="text-2xl font-black uppercase tracking-tight">Mon Espace</h1>
              <button onClick={logout} className="p-3 bg-red-50 text-red-600 rounded-2xl font-bold text-sm">
                Déconnexion
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-1 space-y-6">
                <section className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 text-center">
                  <div className="w-20 h-20 bg-gray-100 rounded-[1.5rem] mx-auto mb-4 flex items-center justify-center text-gray-400">
                    <UserIcon size={40} />
                  </div>
                  <h2 className="font-black text-xl">{user?.firstName} {user?.lastName}</h2>
                  <p className="text-sm text-gray-500">{user?.email}</p>
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest mt-2">{user?.role === 'admin' ? 'Administrateur' : 'Client Privilégié'}</p>
                </section>

                <nav className="bg-white rounded-[2rem] p-4 shadow-sm border border-gray-100 space-y-1">
                  <button className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 text-primary font-bold text-sm" style={{ color: '#0066b2' }}>
                    <ShoppingCart size={18} /> Commandes
                  </button>
                  <button className="w-full flex items-center gap-3 p-3 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors">
                    <UserIcon size={18} /> Informations
                  </button>
                  {user?.role === 'admin' && (
                    <button 
                      onClick={() => setView('admin')}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors font-bold"
                    >
                      <StoreIcon size={18} /> Panel Admin
                    </button>
                  )}
                </nav>
              </div>

              <div className="md:col-span-2">
                <section className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 min-h-[400px]">
                  <h3 className="font-black text-lg mb-6 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-secondary rounded-full"></div>
                    Historique des commandes
                  </h3>
                  
                  <div className="space-y-4">
                    {orders.length === 0 ? (
                      <div className="py-20 text-center text-gray-300">
                        <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                          <ShoppingCart size={24} />
                        </div>
                        <p className="text-sm font-medium">Aucune commande pour le moment</p>
                      </div>
                    ) : (
                      orders.map(order => (
                        <div key={order.id} className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between border border-gray-100">
                          <div>
                            <div className="text-xs font-black text-gray-400 uppercase tracking-widest">Commande #{order.id.slice(0, 8)}</div>
                            <div className="font-bold text-gray-900">{formatPrice(order.total)}</div>
                            <div className="text-[10px] text-gray-500">{new Date(order.created_at).toLocaleDateString('fr-GA')}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={cn(
                              "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                              order.status === 'pending' ? "bg-orange-100 text-orange-600" : "bg-green-100 text-green-600"
                            )}>
                              {order.status === 'pending' ? 'En cours' : 'Livré'}
                            </span>
                            <button className="p-2 bg-white rounded-xl shadow-sm text-secondary hover:text-primary transition-colors">
                              <ChevronRight size={18} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          </main>
        </div>
      </AppContext.Provider>
    );
  }

  if (view === 'admin') {
    return (
      <AppContext.Provider value={contextValue}>
        <div className="min-h-screen bg-gray-900 text-white flex">
          <aside className="w-64 border-r border-gray-800 p-8 space-y-8 hidden lg:block">
            <div className="text-2xl font-black text-white px-2">CECADO<span className="text-primary">.admin</span></div>
            <nav className="space-y-2">
              <button className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/10 font-bold text-sm">Dashboard</button>
              <button className="w-full flex items-center gap-3 p-3 rounded-2xl text-gray-500 hover:bg-white/5 transition-colors font-bold text-sm">Utilisateurs</button>
              <button className="w-full flex items-center gap-3 p-3 rounded-2xl text-gray-500 hover:bg-white/5 transition-colors font-bold text-sm">Produits</button>
            </nav>
            <button onClick={() => setView('home')} className="flex items-center gap-2 text-xs text-gray-500 hover:text-white mt-20">
              <ArrowLeft size={14} /> Retour au site
            </button>
          </aside>
          
          <main className="flex-1 p-8 lg:p-12 overflow-y-auto">
            <header className="flex justify-between items-center mb-12">
              <h1 className="text-3xl font-black tracking-tight">Panneau de Contrôle</h1>
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-gray-500">ADMIN MODE</span>
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-black">A</div>
              </div>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              {[
                { label: 'Ventes du jour', val: '0 FCFA', icon: CreditCard, color: 'text-green-400' },
                { label: 'Commandes', val: orders.length.toString(), icon: ShoppingCart, color: 'text-blue-400' },
                { label: 'Utilisateurs', val: adminUsers.length.toString(), icon: UserIcon, color: 'text-purple-400' },
                { label: 'Stock alertes', val: '0', icon: StoreIcon, color: 'text-red-400' },
              ].map((stat, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-[2rem] p-6 hover:bg-white/10 transition-colors">
                  <div className={`p-3 bg-white/5 rounded-2xl w-fit mb-4 ${stat.color}`}>
                    <stat.icon size={20} />
                  </div>
                  <div className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-1">{stat.label}</div>
                  <div className="text-xl font-black">{stat.val}</div>
                </div>
              ))}
            </div>

            <section className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden">
              <div className="p-8 border-b border-white/10 flex justify-between items-center">
                <h2 className="font-black text-xl">Derniers Utilisateurs</h2>
                <button className="text-xs font-bold text-primary hover:underline">Voir tout</button>
              </div>
              <div className="overflow-x-auto p-4">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black uppercase text-gray-500 tracking-widest border-b border-white/5">
                      <th className="p-4">Utilisateur</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Rôle</th>
                      <th className="p-4">Inscrit le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((u, i) => (
                      <tr key={u.id} className={cn("border-b border-white/5 hover:bg-white/5 transition-colors", i === adminUsers.length - 1 && "border-none")}>
                        <td className="p-4 font-bold">{u.first_name} {u.last_name}</td>
                        <td className="p-4 text-gray-400">{u.email}</td>
                        <td className="p-4">
                          <span className={cn(
                            "px-2 py-1 text-[10px] font-black rounded-full uppercase",
                            u.role === 'admin' ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                          )}>
                            {u.role}
                          </span>
                        </td>
                        <td className="p-4 text-gray-500 text-xs text-nowrap">{new Date(u.created_at).toLocaleDateString('fr-GA')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </div>
      </AppContext.Provider>
    );
  }

  if (view === 'checkout') {
    return (
      <AppContext.Provider value={contextValue}>
        <div className="min-h-screen bg-gray-50 pb-20">
          <header className="bg-white border-b p-4 sticky top-0 z-50 flex items-center gap-4">
            <button onClick={() => setView('home')} className="p-2 hover:bg-gray-100 rounded-full">
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-bold">Finaliser ma commande</h1>
          </header>
          
          <main className="max-w-xl mx-auto p-4 space-y-6">
            <section className="bg-white rounded-3xl p-6 shadow-sm space-y-4">
              <h2 className="font-bold flex items-center gap-2">
                <MapPin className="text-primary" size={20} style={{ color: '#0066b2' }} /> Mode de réception
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <button className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-primary bg-primary/5" style={{ borderColor: '#0066b2' }}>
                  <StoreIcon size={24} style={{ color: '#0066b2' }} />
                  <span className="text-sm font-bold">Retrait</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-gray-100 opacity-50 cursor-not-allowed">
                  <MapPin size={24} />
                  <span className="text-sm font-bold">Livraison</span>
                </button>
              </div>
            </section>

            <section className="bg-white rounded-3xl p-6 shadow-sm space-y-4">
              <h2 className="font-bold flex items-center gap-2">
                <CreditCard className="text-primary" size={20} style={{ color: '#0066b2' }} /> Paiement recommandé
              </h2>
              <div className="space-y-3">
                <button 
                  onClick={() => handlePlaceOrder('mobile_money', 'pickup')}
                  className="w-full flex items-center justify-between p-4 bg-orange-50 rounded-2xl border-2 border-orange-200 hover:bg-orange-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold">M</div>
                    <div className="text-left">
                      <p className="font-bold">Airtel / Moov Money</p>
                      <p className="text-xs text-orange-600">Le plus utilisé au Gabon</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-orange-400" />
                </button>

                <button 
                  onClick={() => handlePlaceOrder('store', 'pickup')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl border-2 border-gray-100 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <StoreIcon size={24} />
                    <div className="text-left">
                      <p className="font-bold">Payer en magasin</p>
                      <p className="text-xs text-gray-500">Au comptoir Click & Collect</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-gray-400" />
                </button>
              </div>
            </section>

            <section className="bg-white rounded-3xl p-6 shadow-sm">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Sous-total</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Frais de service</span>
                  <span className="text-green-600">OFFERT</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Total à payer</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
              </div>
            </section>
          </main>
        </div>
      </AppContext.Provider>
    );
  }

  if (view === 'success') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-6"
        >
          <Check size={40} />
        </motion.div>
        <h1 className="text-2xl font-black mb-2 uppercase">Commande confirmée !</h1>
        <p className="text-gray-500 mb-8 max-w-xs">Votre commande <span className="font-bold text-gray-900">#{orderId}</span> est en cours de préparation au {selectedStore?.name}.</p>
        
        <div className="w-full max-w-xs bg-gray-50 p-6 rounded-3xl mb-8">
          <div className="flex justify-between text-sm mb-2 text-gray-500 font-medium uppercase tracking-wider">
            <span>Ticket Numérique</span>
            <span className="text-primary" style={{ color: '#0066b2' }}>CECADO Blue</span>
          </div>
          <div className="border border-dashed border-gray-200 my-4" />
          <div className="flex flex-col items-center gap-4">
             <div className="w-full h-12 bg-gray-900 rounded flex items-center justify-center gap-1 overflow-hidden p-2">
                {[...Array(20)].map((_, i) => (
                  <div key={i} className="h-full bg-white" style={{ width: Math.random() * 8 + 2 }} />
                ))}
             </div>
             <p className="text-xs font-mono text-gray-400 uppercase">CMD-{orderId?.slice(0, 8)}</p>
          </div>
        </div>

        <button 
          onClick={() => setView('home')}
          className="w-full max-w-xs py-4 bg-primary text-white rounded-xl font-bold"
          style={{ backgroundColor: '#0066b2' }}
        >
          Retour à l'accueil
        </button>
      </div>
    );
  }

  return (
    <AppContext.Provider value={contextValue}>
      <div className="min-h-screen bg-[#F3F4F6] text-[#1F2937] font-sans flex">
        <Toaster position="bottom-center" />
        
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:flex w-72 bg-white border-r border-gray-200 flex-col sticky top-0 h-screen shrink-0">
          <div className="p-8">
            <div className="text-3xl font-black text-primary tracking-tighter">CECADO<span className="text-secondary">.ga</span></div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mt-1">Supermarché en ligne</p>
          </div>
          
          <nav className="flex-1 px-4 space-y-2">
            <button 
              onClick={() => setSelectedCategory(null)}
              className={cn(
                "w-full px-4 py-3 rounded-2xl flex items-center gap-3 font-semibold text-sm transition-all",
                !selectedCategory ? "bg-red-50 text-red-600 shadow-sm" : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <StoreIcon size={20} /> Accueil
            </button>
            <div className="pt-4 pb-2 px-4">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Rayons Populaires</span>
            </div>
            {categories.slice(0, 5).map(cat => (
              <button 
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "w-full px-4 py-3 rounded-2xl flex items-center gap-3 font-medium text-sm transition-all",
                  selectedCategory === cat.id ? "bg-blue-50 text-blue-600 shadow-sm" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                <ChevronRight size={16} className={cn("transition-transform", selectedCategory === cat.id && "rotate-90")} />
                {cat.name}
              </button>
            ))}
          </nav>

          <div className="p-6 mt-auto">
            <div className="bg-gradient-to-br from-secondary to-blue-800 rounded-3xl p-5 text-white shadow-xl shadow-blue-100">
              <div className="text-xs opacity-80 mb-1">Programme Fidélité</div>
              <div className="text-xl font-bold">2 450 Pts</div>
              <div className="w-full bg-blue-400/30 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className="bg-white w-2/3 h-full rounded-full shrink-0"></div>
              </div>
              <div className="text-[10px] mt-2 font-medium">Prochain palier : -10% de réduction</div>
            </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 sm:px-8 h-20 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4 flex-1">
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-full"
              >
                <Menu size={24} />
              </button>
              
              <div className="hidden lg:block lg:w-96">
                <div className="relative">
                  <span className="absolute inset-y-0 left-4 flex items-center text-gray-400">
                    <Search size={18} />
                  </span>
                  <input 
                    type="text" 
                    placeholder="Chercher un produit, un rayon..." 
                    className="w-full bg-gray-100 border-none rounded-2xl py-3 pl-12 pr-4 text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                  />
                </div>
              </div>

              {/* Mobile Brand */}
              <div className="lg:hidden flex flex-col">
                <span className="text-xl font-black tracking-tighter text-primary">CECADO</span>
                <div className="flex items-center gap-1 text-[9px] text-gray-500 font-bold uppercase tracking-wider">
                  <MapPin size={8} />
                  <span>{selectedStore?.name}</span>
                </div>
              </div>
            </div>

              <div className="flex items-center gap-1 sm:gap-4">
                <button 
                  onClick={() => user ? setView('profile') : setView('auth')}
                  className="p-2 hover:bg-gray-100 rounded-full flex gap-2 items-center"
                >
                  <UserIcon size={24} />
                  {user && (
                    <span className="hidden sm:block text-xs font-bold text-gray-900">{user.firstName}</span>
                  )}
                </button>
                <button 
                  onClick={() => setIsCartOpen(true)}
                  className="p-3 bg-gray-100 rounded-2xl text-gray-600 hover:bg-gray-200 transition-colors relative"
                >
                  <ShoppingCart size={22} />
                  {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                      {cart.length}
                    </span>
                  )}
                </button>
              </div>
          </header>

          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 custom-scrollbar">
            {/* Bento Grid Features */}
            {!selectedCategory && (
              <section className="grid grid-cols-1 lg:grid-cols-4 lg:grid-rows-2 gap-6 mb-8">
                <div className="lg:col-span-2 lg:row-span-2 bg-white rounded-[2rem] p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden shadow-sm border border-gray-100">
                  <div className="relative z-10">
                    <span className="bg-red-100 text-red-600 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full">Offre Exceptionnelle</span>
                    <h1 className="text-3xl sm:text-5xl font-black mt-6 leading-[1.1] tracking-tight text-gray-900">Faites vos courses<br />à domicile.</h1>
                    <p className="text-gray-500 mt-6 max-w-sm text-sm sm:text-base leading-relaxed">Livraison garantie en moins de 2h sur tout Libreville. Frais de port offerts dès 30 000 FCFA.</p>
                  </div>
                  <div className="flex flex-wrap gap-4 relative z-10 mt-8">
                    <button className="bg-primary hover:bg-primary/90 text-white px-8 py-4 rounded-2xl font-bold text-sm shadow-xl shadow-red-100 transition-all active:scale-95">Commander maintenant</button>
                    <button className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-8 py-4 rounded-2xl font-bold text-sm transition-all active:scale-95">Voir catalogue</button>
                  </div>
                  {/* Decorative element */}
                  <div className="absolute -right-20 -top-20 w-80 h-80 bg-red-50 rounded-full blur-3xl opacity-50"></div>
                  <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden sm:flex w-56 h-56 bg-gray-50 rounded-3xl items-center justify-center border border-gray-100 -rotate-6 shadow-sm">
                    <div className="text-center">
                      <div className="text-5xl mb-3">🛍️</div>
                      <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Panier Express</div>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-[2rem] p-6 border border-blue-100 flex flex-col justify-between hover:bg-blue-100 transition-all group">
                  <div className="flex justify-between items-start">
                    <div className="w-12 h-12 bg-secondary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100 group-hover:scale-110 transition-transform">
                      <Smartphone size={24} />
                    </div>
                    <span className="text-[10px] font-black text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full">NOUVEAU</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight mb-2">Scan & Go</h3>
                    <p className="text-xs text-blue-800 leading-relaxed opacity-80">Scannez vos articles en rayon et payez directement sur l'application CECADO.</p>
                  </div>
                </div>

                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex flex-col justify-between hover:border-gray-300 transition-all">
                  <div className="flex -space-x-3">
                    <div className="w-10 h-10 rounded-2xl bg-orange-500 border-2 border-white flex items-center justify-center text-sm font-black text-white shadow-md">A</div>
                    <div className="w-10 h-10 rounded-2xl bg-yellow-400 border-2 border-white flex items-center justify-center text-sm font-black text-white shadow-md">M</div>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">Paiements Locaux</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">Airtel Money & Moov Money acceptés pour toutes vos commandes en ligne.</p>
                  </div>
                </div>

                <div className="bg-green-50 rounded-[2rem] p-6 border border-green-100 hover:bg-green-100 transition-all">
                  <div className="w-12 h-12 bg-green-600 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-green-100">
                    <Phone size={24} />
                  </div>
                  <h3 className="font-bold text-lg mb-2">Aide WhatsApp</h3>
                  <p className="text-xs text-green-800 leading-relaxed">Assistance directe 7j/7 par nos conseillers au <span className="font-black">+241 07 00 00 00</span></p>
                </div>

                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex flex-col justify-between hover:border-gray-300 transition-all">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Click & Collect</span>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
                  </div>
                  <div>
                    <p className="text-sm font-black mb-1">Prêt en 30 min</p>
                    <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Magasin {selectedStore?.name}</p>
                  </div>
                </div>
              </section>
            )}

            {/* Content Area */}
            <section className="bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm border border-gray-100">
              <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-1.5 h-8 bg-primary rounded-full"></div>
                  <div>
                    <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                      {selectedCategory ? categories.find(c => c.id === selectedCategory)?.name : 'Nos Incontournables'}
                    </h3>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Sélection du jour • {products.length} articles</p>
                  </div>
                </div>
                
                {/* Horizontal Category Scroll (only shown if not selected) */}
                <div className="flex overflow-x-auto gap-2 no-scrollbar px-2 py-1">
                  <button 
                    onClick={() => setSelectedCategory(null)}
                    className={cn(
                      "px-5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95",
                      !selectedCategory ? "bg-primary text-white shadow-lg shadow-red-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    )}
                  >
                    Tous
                  </button>
                  {categories.map(cat => (
                    <button 
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={cn(
                        "px-5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95",
                        selectedCategory === cat.id ? "bg-secondary text-white shadow-lg shadow-blue-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      )}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </header>
              
              {products.length === 0 ? (
                <div className="py-24 text-center">
                  <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-gray-300">
                    <ShoppingCart size={32} />
                  </div>
                  <p className="text-gray-400 font-medium">Chargement de votre rayon...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {products.map(product => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              )}
            </section>
          </main>
        </div>

        {/* Floating Mobile Nav - Hide on Large */}
        <nav className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] bg-white/40 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/20 z-40 px-8 py-4">
          <ul className="flex items-center justify-between">
            <li>
              <button 
                onClick={() => setSelectedCategory(null)}
                className={cn("flex flex-col items-center gap-1", !selectedCategory ? "text-primary" : "text-gray-400")}
              >
                <StoreIcon size={22} />
                <span className="text-[10px] font-black uppercase tracking-tighter">Magasin</span>
              </button>
            </li>
            <li>
              <button className="flex flex-col items-center gap-1 text-gray-400">
                <Menu size={22} />
                <span className="text-[10px] font-black uppercase tracking-tighter">Rayons</span>
              </button>
            </li>
            <li>
              <button onClick={() => setIsCartOpen(true)} className="flex flex-col items-center gap-1 text-gray-400 relative">
                <ShoppingCart size={22} />
                {cart.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full"></span>}
                <span className="text-[10px] font-black uppercase tracking-tighter">Panier</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => user ? setView('profile') : setView('auth')}
                className={cn("flex flex-col items-center gap-1", view === 'profile' ? "text-primary" : "text-gray-400")}
              >
                <UserIcon size={22} />
                <span className="text-[10px] font-black uppercase tracking-tighter">{user ? 'Moi' : 'Profil'}</span>
              </button>
            </li>
          </ul>
        </nav>

        {/* Sidebar Cart */}
        <CartSidebar 
          isOpen={isCartOpen} 
          onClose={() => setIsCartOpen(false)} 
          onCheckout={handleCheckoutClick}
        />
      </div>
    </AppContext.Provider>
  );
}
