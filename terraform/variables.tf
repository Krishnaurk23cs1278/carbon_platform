variable "prefix" {
  description = "A prefix used for all resources in this example"
  default     = "carbon"
}

variable "location" {
  description = "The Azure Region in which all resources in this example should be provisioned"
  default     = "East US"
}

variable "kubernetes_version" {
  description = "Version of Kubernetes to install on the cluster"
  default     = "1.28.9"
}
