
import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { OrdersListButton } from "./OrdersListButton";

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="fixed w-full bg-card/85 backdrop-blur-xl border-b-2 border-border shadow-soft z-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 md:h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <a href="/" className="font-display font-extrabold text-xl md:text-2xl tracking-tight text-primary">
                Aleph Engineering
              </a>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="ml-10 flex items-center space-x-4">
              <a href="#home" className="text-muted-foreground hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition-colors">Home</a>
              <a href="#about" className="text-muted-foreground hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition-colors">About</a>
              <a href="#services" className="text-muted-foreground hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition-colors">Services</a>
              <a href="#contact" className="text-muted-foreground hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition-colors">Contact</a>
              <OrdersListButton />
              <Button variant="default" className="ml-4 bg-primary text-primary-foreground hover:bg-primary/90 text-sm">Get Started</Button>
            </div>
          </div>
          <div className="md:hidden">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-muted-foreground hover:text-primary"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-card shadow-bold-lg animate-fade-in border-t-2 border-border">
          <div className="px-4 pt-4 pb-4 space-y-2">
            <a 
              href="#home" 
              className="block px-4 py-3 rounded-lg text-base font-medium text-muted-foreground hover:text-primary hover:bg-accent/50 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              Home
            </a>
            <a 
              href="#about" 
              className="block px-4 py-3 rounded-lg text-base font-medium text-muted-foreground hover:text-primary hover:bg-accent/50 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              About
            </a>
            <a 
              href="#services" 
              className="block px-4 py-3 rounded-lg text-base font-medium text-muted-foreground hover:text-primary hover:bg-accent/50 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              Services
            </a>
            <a 
              href="#contact" 
              className="block px-4 py-3 rounded-lg text-base font-medium text-muted-foreground hover:text-primary hover:bg-accent/50 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              Contact
            </a>
            <div className="pt-4 space-y-3 border-t border-border">
              <div className="px-2">
                <OrdersListButton />
              </div>
              <Button variant="default" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-3">
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
