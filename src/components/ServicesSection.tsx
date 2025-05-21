
import { ShieldCheck, Briefcase, Settings, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const services = [
  {
    title: "Strategy Consulting",
    description: "We help you develop effective business strategies to achieve your goals and overcome challenges.",
    icon: Briefcase,
    features: ["Market Analysis", "Competitive Positioning", "Growth Planning"]
  },
  {
    title: "Technology Solutions",
    description: "Our custom technology solutions are designed to streamline your operations and boost efficiency.",
    icon: Settings,
    features: ["Custom Software", "System Integration", "Digital Transformation"]
  },
  {
    title: "Security Services",
    description: "Protect your business with our comprehensive security solutions and risk management strategies.",
    icon: ShieldCheck,
    features: ["Risk Assessment", "Security Implementation", "Ongoing Monitoring"]
  }
];

const ServicesSection = () => {
  return (
    <section id="services" className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Our Services</h2>
          <div className="mt-4 w-24 h-1 mx-auto bg-company-blue rounded"></div>
          <p className="mt-6 text-xl text-gray-600 max-w-3xl mx-auto">
            We offer a range of services designed to help your business thrive in today's competitive market.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <Card key={index} className="group hover:shadow-lg transition-shadow duration-300 border border-gray-200">
              <CardHeader className="pb-3">
                <div className="mb-4 w-12 h-12 rounded-full bg-company-blue/10 flex items-center justify-center text-company-blue">
                  <service.icon size={24} />
                </div>
                <CardTitle className="text-xl font-bold">{service.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base text-gray-600">
                  {service.description}
                </CardDescription>
                <ul className="mt-4 space-y-2">
                  {service.features.map((feature, i) => (
                    <li key={i} className="flex items-center text-gray-700">
                      <ChevronRight size={16} className="text-company-blue mr-2" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <a href="#contact" className="text-company-blue font-medium flex items-center group-hover:translate-x-1 transition-transform">
                  Learn More <ChevronRight size={16} className="ml-1" />
                </a>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
