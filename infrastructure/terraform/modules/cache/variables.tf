variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

variable "cache_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "cache_engine_version" {
  type    = string
  default = "7.0"
}

variable "cache_num_nodes" {
  type    = number
  default = 2
}

variable "cache_multi_az" {
  type    = bool
  default = true
}

variable "cache_automatic_failover" {
  type    = bool
  default = true
}

variable "cache_at_rest_encryption" {
  type    = bool
  default = true
}

variable "cache_transit_encryption" {
  type    = bool
  default = true
}
