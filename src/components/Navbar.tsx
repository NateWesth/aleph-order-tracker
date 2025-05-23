
import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from "@/components/ui/button";

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="fixed w-full bg-white shadow-sm z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <a href="/" className="font-bold text-2xl text-aleph-blue">
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
              <Button variant="default" className="ml-4 bg-aleph-blue hover:bg-blue-500 text-white">Get Started</Button>
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
        <div className="md:hidden bg-white shadow-lg animate-fade-in">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <a 
              href="#home" 
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-aleph-blue hover:bg-gray-50"
              onClick={() => setIsMenuOpen(false)}
            >
              Home
            </a>
            <a 
              href="#about" 
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-aleph-blue hover:bg-gray-50"
              onClick={() => setIsMenuOpen(false)}
            >
              About
            </a>
            <a 
              href="#services" 
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-aleph-blue hover:bg-gray-50"
              onClick={() => setIsMenuOpen(false)}
            >
              Services
            </a>
            <a 
              href="#contact" 
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-aleph-blue hover:bg-gray-50"
              onClick={() => setIsMenuOpen(false)}
            >
              Contact
            </a>
            <div className="pt-2">
              <Button variant="default" className="w-full bg-aleph-blue hover:bg-blue-500 text-white">
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
