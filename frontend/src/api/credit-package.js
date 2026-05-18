import request from "./request.js";
export function getCreditPackages() {
  return request.get("credit-package");
}

export function postCreditPackage(id) {
  return request.post(`credit-package/${id}`);
}

export function createEcpayOrder(creditPackageId) {
  return request.post("payment/create", { creditPackageId });
}
