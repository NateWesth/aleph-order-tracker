
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormData } from "@/utils/authValidation";

interface LoginFormFieldsProps {
  formData: FormData;
  setFormData: (data: FormData) => void;
}

const LoginFormFields = ({ formData, setFormData }: LoginFormFieldsProps) => {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({...formData, email: e.target.value})}
          required
          className="dark:bg-gray-700 dark:border-gray-600"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({...formData, password: e.target.value})}
          required
          className="dark:bg-gray-700 dark:border-gray-600"
        />
      </div>

      <div className="space-y-3">
        <Label>Login As</Label>
        <RadioGroup 
          value={formData.userType} 
          onValueChange={(value) => setFormData({...formData, userType: value, accessCode: ""})}
          className="flex flex-col space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="client" id="client" />
            <Label htmlFor="client" className="cursor-pointer">Client User</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="admin" id="admin" />
            <Label htmlFor="admin" className="cursor-pointer">Admin User (Aleph Engineering & Supplies)</Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="accessCode">
          {formData.userType === "admin" ? "Admin Access Code" : "Company Code"}
        </Label>
        <Input
          id="accessCode"
          type={formData.userType === "admin" ? "password" : "text"}
          value={formData.accessCode}
          onChange={(e) => setFormData({...formData, accessCode: e.target.value})}
          placeholder={formData.userType === "admin" ? "Enter admin access code" : "Enter your company code"}
          required
          className="dark:bg-gray-700 dark:border-gray-600"
        />
        {formData.userType === "admin" && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Contact Aleph Engineering and Supplies for the admin access code
          </p>
        )}
      </div>
    </>
  );
};

export default LoginFormFields;
