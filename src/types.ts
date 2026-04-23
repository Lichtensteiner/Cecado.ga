export interface Category {
  id: string;
  name: string;
  icon: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category_id: string;
  image_url: string;
  stock: number;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface CartItem extends Product {
  quantity: number;
}

export type PaymentMethod = 'mobile_money' | 'card' | 'store';
export type OrderType = 'pickup' | 'delivery';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: string;
  role: 'client' | 'admin';
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Order {
  id: string;
  user_id: string;
  status: string;
  total: number;
  payment_method: string;
  type: string;
  created_at: string;
}
