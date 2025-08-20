
import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { OrdersListButton } from "./OrdersListButton";

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="fixed w-full bg-white shadow-sm z-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 md:h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <a href="/" className="font-bold text-lg md:text-2xl text-aleph-blue">
                Aleph Engineering
              </a>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="ml-10 flex items-center space-x-4">
              <a href="#home" className="text-gray-600 hover:text-aleph-blue px-3 py-2 rounded-md text-sm font-medium transition-colors">Home</a>
              <a href="#about" className="text-gray-600 hover:text-aleph-blue px-3 py-2 rounded-md text-sm font-medium transition-colors">About</a>
              <a href="#services" className="text-gray-600 hover:text-aleph-blue px-3 py-2 rounded-md text-sm font-medium transition-colors">Services</a>
              <a href="#contact" className="text-gray-600 hover:text-aleph-blue px-3 py-2 rounded-md text-sm font-medium transition-colors">Contact</a>
              <OrdersListButton />
              <Button variant="default" className="ml-4 bg-aleph-blue hover:bg-blue-500 text-white text-sm">Get Started</Button>
            </div>
          </div>
          <div className="md:hidden">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-600 hover:text-aleph-blue"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-white shadow-lg animate-fade-in border-t">
          <div className="px-4 pt-4 pb-4 space-y-2">
            <a 
              href="#home" 
              className="block px-4 py-3 rounded-lg text-base font-medium text-gray-600 hover:text-aleph-blue hover:bg-gray-50 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              Home
            </a>
            <a 
              href="#about" 
              className="block px-4 py-3 rounded-lg text-base font-medium text-gray-600 hover:text-aleph-blue hover:bg-gray-50 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              About
            </a>
            <a 
              href="#services" 
              className="block px-4 py-3 rounded-lg text-base font-medium text-gray-600 hover:text-aleph-blue hover:bg-gray-50 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              Services
            </a>
            <a 
              href="#contact" 
              className="block px-4 py-3 rounded-lg text-base font-medium text-gray-600 hover:text-aleph-blue hover:bg-gray-50 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              Contact
            </a>
            <div className="pt-4 space-y-3 border-t border-gray-200">
              <div className="px-2">
                <OrdersListButton />
              </div>
              <Button variant="default" className="w-full bg-aleph-blue hover:bg-blue-500 text-white py-3">
                Get Started
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
