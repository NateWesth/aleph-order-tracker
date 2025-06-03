
import OrdersPage from "@/components/orders/OrdersPage";
import ProgressPage from "@/components/orders/ProgressPage";
import ProcessingPage from "@/components/orders/ProcessingPage";
import CompletedPage from "@/components/orders/CompletedPage";
import FilesPage from "@/components/orders/FilesPage";
import ClientCompaniesPage from "@/components/admin/ClientCompaniesPage";
import DeliveryNotePage from "@/components/admin/DeliveryNotePage";
import UsersManagementPage from "@/components/admin/UsersManagementPage";
import AdminWelcome from "./AdminWelcome";

interface AdminMainContentProps {
  activeView: string;
}

export default function AdminMainContent({ activeView }: AdminMainContentProps) {
  const renderContent = () => {
    switch (activeView) {
      case "home":
        return <AdminWelcome />;
      case "orders":
        return <OrdersPage isAdmin={true} />;
      case "progress":
        return <ProgressPage isAdmin={true} />;
      case "processing":
        return <ProcessingPage isAdmin={true} />;
      case "delivery-notes":
        return <DeliveryNotePage />;
      case "completed":
        return <CompletedPage isAdmin={true} />;
      case "files":
        return <FilesPage isAdmin={true} />;
      case "companies":
        return <ClientCompaniesPage />;
      case "users":
        return <UsersManagementPage />;
      default:
        return (
          <div className="text-center p-8 bg-white dark:bg-gray-800 min-h-full">
            <h2 className="text-2xl font-bold mb-4 text-aleph-green">Page Not Found</h2>
            <p className="text-gray-600 dark:text-gray-300">The requested page could not be found.</p>
          </div>
        );
    }
  };

  return (
    <main className="flex-1 p-4 md:p-8 bg-white dark:bg-gray-800">
      <div className="bg-white dark:bg-gray-800 min-h-full">
        {renderContent()}
      </div>
    </main>
  );
}
