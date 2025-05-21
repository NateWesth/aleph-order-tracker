
import { Button } from "@/components/ui/button";

const HeroSection = () => {
  return (
    <section id="home" className="pt-24 pb-12 md:pt-32 md:pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center">
          <div className="md:w-1/2 mb-10 md:mb-0 md:pr-10">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 animate-in fade-in-delay-1">
              Professional Solutions for Your Business
            </h1>
            <p className="mt-6 text-xl text-gray-600 animate-in fade-in-delay-2">
              We help companies achieve their goals with innovative and tailored solutions.
              Partner with us to transform your business today.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 animate-in fade-in-delay-3">
              <Button className="text-base px-8 py-6 bg-company-blue hover:bg-company-darkblue">
                Get Started
              </Button>
              <Button variant="outline" className="text-base px-8 py-6">
                Learn More
              </Button>
            </div>
          </div>
          <div className="md:w-1/2 animate-in fade-in-delay-2">
            <div className="relative rounded-2xl overflow-hidden shadow-xl">
              <div className="aspect-[4/3] bg-gradient-to-r from-company-blue to-company-accent flex items-center justify-center">
                <img 
                  src="https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?auto=format&fit=crop&w=800&q=80" 
                  alt="Professional team working" 
                  className="mix-blend-overlay opacity-60"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/90 backdrop-blur-sm rounded-lg p-6 shadow-lg max-w-md">
                    <h3 className="text-xl font-bold text-gray-900">Your Success Is Our Priority</h3>
                    <p className="mt-2 text-gray-600">We're dedicated to delivering excellence in everything we do.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
