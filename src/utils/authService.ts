
// Re-export all auth functions from their modules to maintain backward compatibility
export { getUserProfile } from "./auth/authProfile";
export { getUserRole, isUserAdmin } from "./auth/authRoles";
export { signInUser, validateUserRole, validateCompanyAssociation } from "./auth/authSignIn";
export { getErrorMessage } from "./auth/authErrors";
export { type UserRole, type FormData, type UserProfile } from "./auth/authTypes";
