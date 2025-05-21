
import { CheckCircle } from 'lucide-react';

const AboutSection = () => {
  return (
    <section id="about" className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">About Our Company</h2>
          <div className="mt-4 w-24 h-1 mx-auto bg-company-blue rounded"></div>
          <p className="mt-6 text-xl text-gray-600 max-w-3xl mx-auto">
            We're a team of passionate professionals dedicated to delivering exceptional solutions.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="rounded-xl overflow-hidden shadow-lg">
              <img 
                src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80"
                alt="Our team at work"
                className="w-full h-auto"
              />
            </div>
          </div>
          
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Our Mission</h3>
            <p className="mt-4 text-gray-600">
              Our mission is to empower businesses with innovative solutions that drive growth and success.
              We are committed to excellence in everything we do and strive to exceed client expectations.
            </p>
            
            <div className="mt-8 space-y-4">
              <div className="flex items-start">
                <CheckCircle className="h-6 w-6 text-company-blue flex-shrink-0 mr-3" />
                <p className="text-gray-600"><span className="font-semibold">10+ years</span> of industry experience</p>
              </div>
              <div className="flex items-start">
                <CheckCircle className="h-6 w-6 text-company-blue flex-shrink-0 mr-3" />
                <p className="text-gray-600"><span className="font-semibold">200+ clients</span> served worldwide</p>
              </div>
              <div className="flex items-start">
                <CheckCircle className="h-6 w-6 text-company-blue flex-shrink-0 mr-3" />
                <p className="text-gray-600"><span className="font-semibold">98% satisfaction</span> rate from our clients</p>
              </div>
              <div className="flex items-start">
                <CheckCircle className="h-6 w-6 text-company-blue flex-shrink-0 mr-3" />
                <p className="text-gray-600"><span className="font-semibold">Award-winning</span> solutions and service</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
