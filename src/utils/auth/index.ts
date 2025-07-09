
// Re-export all auth functions from their modules
export { getUserProfile, type UserProfile } from "./authProfile";
export { getUserRole, isUserAdmin } from "./authRoles";
export { signInUser, validateUserRole, validateCompanyAssociation } from "./authSignIn";
export { getErrorMessage } from "./authErrors";
export { type UserRole, type FormData } from "./authTypes";
