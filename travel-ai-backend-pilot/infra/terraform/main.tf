############################
# Networking
############################
resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.tags, { Name = "${local.app_name}-vpc" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(local.tags, { Name = "${local.app_name}-igw" })
}

resource "aws_subnet" "public" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.this.id
  availability_zone = local.azs[count.index]
  cidr_block        = local.public_cidrs[count.index]

  map_public_ip_on_launch = true

  tags = merge(local.tags, {
    Name = "${local.app_name}-public-${count.index + 1}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.this.id
  availability_zone = local.azs[count.index]
  cidr_block        = local.private_cidrs[count.index]

  tags = merge(local.tags, {
    Name = "${local.app_name}-private-${count.index + 1}"
    Tier = "private"
  })
}

resource "aws_eip" "nat" {
  count  = var.use_nat_gateway ? 1 : 0
  domain = "vpc"
  tags   = merge(local.tags, { Name = "${local.app_name}-nat-eip" })
}

resource "aws_nat_gateway" "this" {
  count         = var.use_nat_gateway ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id

  tags = merge(local.tags, { Name = "${local.app_name}-nat" })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = merge(local.tags, { Name = "${local.app_name}-public-rt" })
}

resource "aws_route" "public_default" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  tags   = merge(local.tags, { Name = "${local.app_name}-private-rt" })
}

resource "aws_route" "private_default" {
  count                  = var.use_nat_gateway ? 1 : 0
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[0].id
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

############################
# Security Groups
############################
resource "aws_security_group" "alb" {
  name        = "${local.app_name}-alb-sg"
  description = "ALB ingress"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, { Name = "${local.app_name}-alb-sg" })
}

resource "aws_security_group" "ecs" {
  name        = "${local.app_name}-ecs-sg"
  description = "ECS service ingress"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "App traffic from ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, { Name = "${local.app_name}-ecs-sg" })
}

resource "aws_security_group" "db" {
  name        = "${local.app_name}-db-sg"
  description = "Aurora access from ECS"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "Postgres from ECS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, { Name = "${local.app_name}-db-sg" })
}

############################
# Storage buckets
############################
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "ingest_artifacts" {
  bucket = lower("${local.app_name}-ingest-${random_id.bucket_suffix.hex}")
  tags   = merge(local.tags, { Name = "${local.app_name}-ingest" })
}

resource "aws_s3_bucket_versioning" "ingest" {
  bucket = aws_s3_bucket.ingest_artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket" "exports" {
  bucket = lower("${local.app_name}-exports-${random_id.bucket_suffix.hex}")
  tags   = merge(local.tags, { Name = "${local.app_name}-exports" })
}

resource "aws_s3_bucket_versioning" "exports" {
  bucket = aws_s3_bucket.exports.id
  versioning_configuration {
    status = "Enabled"
  }
}

############################
# Database (Aurora PostgreSQL)
############################
resource "random_password" "db_master" {
  length           = var.db_password_length
  override_special = "_#%"
}

resource "aws_db_subnet_group" "aurora" {
  name       = "${local.app_name}-aurora-subnets"
  subnet_ids = aws_subnet.private[*].id
  tags       = merge(local.tags, { Name = "${local.app_name}-aurora-subnets" })
}

resource "aws_rds_cluster" "aurora" {
  cluster_identifier      = "${local.app_name}-aurora"
  engine                  = "aurora-postgresql"
  engine_version          = var.aurora_engine_version
  database_name           = var.db_name
  master_username         = var.db_master_username
  master_password         = random_password.db_master.result
  db_subnet_group_name    = aws_db_subnet_group.aurora.name
  vpc_security_group_ids  = [aws_security_group.db.id]
  backup_retention_period = var.backup_retention_days
  deletion_protection     = var.deletion_protection
  skip_final_snapshot     = var.environment == "dev"
  final_snapshot_identifier = var.environment == "dev" ? null : "${local.app_name}-final-snapshot"

  tags = merge(local.tags, { Name = "${local.app_name}-aurora" })
}

resource "aws_rds_cluster_instance" "writer" {
  identifier         = "${local.app_name}-writer"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = var.aurora_instance_class
  engine             = aws_rds_cluster.aurora.engine
  engine_version     = aws_rds_cluster.aurora.engine_version
  publicly_accessible = false

  tags = merge(local.tags, { Name = "${local.app_name}-aurora-writer" })
}

############################
# Secrets
############################
resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.app_name}/DATABASE_URL"
  recovery_window_in_days = 7
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = format(
    "postgres://%s:%s@%s:5432/%s",
    var.db_master_username,
    random_password.db_master.result,
    aws_rds_cluster.aurora.endpoint,
    var.db_name,
  )
}

resource "aws_secretsmanager_secret" "widget_signing" {
  name                    = "${local.app_name}/WIDGET_SIGNING_SECRET"
  recovery_window_in_days = 7
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "widget_signing" {
  secret_id     = aws_secretsmanager_secret.widget_signing.id
  secret_string = var.widget_signing_secret_value
}

resource "aws_secretsmanager_secret" "widget_admin_key" {
  name                    = "${local.app_name}/WIDGET_ADMIN_KEY"
  recovery_window_in_days = 7
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "widget_admin_key" {
  secret_id     = aws_secretsmanager_secret.widget_admin_key.id
  secret_string = var.widget_admin_key_value
}

resource "aws_secretsmanager_secret" "openai_api_key" {
  name                    = "${local.app_name}/OPENAI_API_KEY"
  recovery_window_in_days = 7
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "openai_api_key" {
  secret_id     = aws_secretsmanager_secret.openai_api_key.id
  secret_string = var.openai_api_key_value
}

resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name                    = "${local.app_name}/ANTHROPIC_API_KEY"
  recovery_window_in_days = 7
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "anthropic_api_key" {
  secret_id     = aws_secretsmanager_secret.anthropic_api_key.id
  secret_string = var.anthropic_api_key_value
}

############################
# ECR
############################
resource "aws_ecr_repository" "app" {
  name                 = "${local.app_name}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = merge(local.tags, { Name = "${local.app_name}-repo" })
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 50 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 50
        }
        action = { type = "expire" }
      }
    ]
  })
}

############################
# ECS
############################
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.app_name}"
  retention_in_days = 30
  tags              = local.tags
}

resource "aws_ecs_cluster" "this" {
  name = "${local.app_name}-cluster"
  tags = local.tags
}

data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${local.app_name}-ecs-exec-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${local.app_name}-ecs-secrets"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "kms:Decrypt"
        ]
        Resource = [
          aws_secretsmanager_secret.database_url.arn,
          aws_secretsmanager_secret.widget_signing.arn,
          aws_secretsmanager_secret.widget_admin_key.arn,
          aws_secretsmanager_secret.openai_api_key.arn,
          aws_secretsmanager_secret.anthropic_api_key.arn,
        ]
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task" {
  name               = "${local.app_name}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
  tags               = local.tags
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${local.app_name}-task"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "app"
      image     = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]
      command = ["node", "dist/server.js"]
      environment = [
        { name = "PORT", value = tostring(var.container_port) },
        { name = "STORAGE_BACKEND", value = "postgres" },
        { name = "PG_SSL", value = "true" },
        { name = "CORS_ALLOW_ORIGINS", value = local.cors_allow_origins },
        { name = "MODEL_PRIMARY_PROVIDER", value = var.model_primary_provider },
        { name = "MODEL_PRIMARY_MODEL", value = var.model_primary_model },
        { name = "MODEL_FALLBACK_PROVIDER", value = var.model_fallback_provider },
        { name = "MODEL_FALLBACK_MODEL", value = var.model_fallback_model },
        { name = "OPENAI_BASE_URL", value = var.openai_base_url },
        { name = "ANTHROPIC_BASE_URL", value = var.anthropic_base_url },
        { name = "RATE_LIMIT_ENABLED", value = tostring(var.rate_limit_enabled) },
        { name = "RATE_LIMIT_WINDOW_MS", value = tostring(var.rate_limit_window_ms) },
        { name = "RATE_LIMIT_MAX_REQUESTS", value = tostring(var.rate_limit_max_requests) },
        { name = "RATE_LIMIT_EXCLUDE_PATH_PREFIXES", value = var.rate_limit_exclude_path_prefixes },
        { name = "GATE_ROUTER_CLASSIFIER_ENABLED", value = tostring(var.gate_router_classifier_enabled) },
        { name = "GATE_ROUTER_CLASSIFIER_PROVIDER", value = var.gate_router_classifier_provider },
        { name = "GATE_ROUTER_CLASSIFIER_MODEL", value = var.gate_router_classifier_model }
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "WIDGET_SIGNING_SECRET", valueFrom = aws_secretsmanager_secret.widget_signing.arn },
        { name = "WIDGET_ADMIN_KEY", valueFrom = aws_secretsmanager_secret.widget_admin_key.arn },
        { name = "OPENAI_API_KEY", valueFrom = aws_secretsmanager_secret.openai_api_key.arn },
        { name = "ANTHROPIC_API_KEY", valueFrom = aws_secretsmanager_secret.anthropic_api_key.arn }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  tags = local.tags
}

############################
# Load Balancer
############################
resource "aws_lb" "app" {
  name               = substr(replace("${local.app_name}-alb", "_", "-"), 0, 32)
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  idle_timeout       = 60

  tags = merge(local.tags, { Name = "${local.app_name}-alb" })
}

resource "aws_wafv2_web_acl" "alb" {
  count = var.enable_waf ? 1 : 0

  name  = "${local.app_name}-alb-waf"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-managed-common"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.app_name}-waf-common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "ip-rate-limit"
    priority = 20

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.app_name}-waf-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.app_name}-waf"
    sampled_requests_enabled   = true
  }

  tags = local.tags
}

resource "aws_wafv2_web_acl_association" "alb" {
  count = var.enable_waf ? 1 : 0

  resource_arn = aws_lb.app.arn
  web_acl_arn  = aws_wafv2_web_acl.alb[0].arn
}

resource "aws_lb_target_group" "app" {
  name        = substr(replace("${local.app_name}-tg", "_", "-"), 0, 32)
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.this.id

  health_check {
    enabled             = true
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }

  tags = local.tags
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_ecs_service" "app" {
  name            = "${local.app_name}-service"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  deployment_controller {
    type = "ECS"
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  network_configuration {
    assign_public_ip = local.ecs_run_public
    security_groups  = [aws_security_group.ecs.id]
    subnets          = local.ecs_run_public ? aws_subnet.public[*].id : aws_subnet.private[*].id
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = var.container_port
  }

  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener.https]
  tags       = local.tags
}

resource "aws_appautoscaling_target" "ecs" {
  count              = var.enable_autoscaling ? 1 : 0
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ecs_cpu" {
  count              = var.enable_autoscaling ? 1 : 0
  name               = "${local.app_name}-cpu-scale"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs[0].resource_id
  scalable_dimension = aws_appautoscaling_target.ecs[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 65
    scale_in_cooldown  = 120
    scale_out_cooldown = 120
  }
}

############################
# CloudFront + DNS
############################
resource "aws_cloudfront_cache_policy" "api" {
  name        = "${local.app_name}-api-no-cache"
  comment     = "Disable caching for API responses"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "all"
    }

    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Authorization", "Content-Type", "Origin", "Accept"]
      }
    }

    query_strings_config {
      query_string_behavior = "all"
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

resource "aws_cloudfront_cache_policy" "widget" {
  name        = "${local.app_name}-widget-cache"
  comment     = "Long cache for widget bootstrap JS"
  default_ttl = 86400
  max_ttl     = 31536000
  min_ttl     = 3600

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

resource "aws_cloudfront_distribution" "app" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.app_name} distribution"
  default_root_object = ""
  aliases             = local.use_custom_domain ? [var.domain] : []

  origin {
    domain_name = aws_lb.app.dns_name
    origin_id   = "alb-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]

    cache_policy_id          = aws_cloudfront_cache_policy.api.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern           = "/widget/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]

    cache_policy_id          = aws_cloudfront_cache_policy.widget.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern           = "/v1/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]

    cache_policy_id          = aws_cloudfront_cache_policy.api.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
    compress                 = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = local.use_custom_domain ? var.cloudfront_certificate_arn : null
    cloudfront_default_certificate = local.use_custom_domain ? false : true
    ssl_support_method             = local.use_custom_domain ? "sni-only" : null
    minimum_protocol_version       = local.use_custom_domain ? "TLSv1.2_2021" : null
  }

  tags = local.tags
}

resource "aws_route53_record" "api_alias" {
  count   = local.use_custom_domain ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}

############################
# Observability
############################
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.app_name}-alb-5xx"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "ALB target 5xx count too high"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.app.arn_suffix
    TargetGroup  = aws_lb_target_group.app.arn_suffix
  }

  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "alb_p95_latency" {
  alarm_name          = "${local.app_name}-alb-p95-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  extended_statistic  = "p95"
  threshold           = 1.5
  alarm_description   = "ALB p95 latency above threshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.app.arn_suffix
    TargetGroup  = aws_lb_target_group.app.arn_suffix
  }

  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "ecs_task_count" {
  alarm_name          = "${local.app_name}-ecs-running-task-count"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Average"
  threshold           = 1
  alarm_description   = "ECS running task count dropped below 1"
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    ClusterName = aws_ecs_cluster.this.name
    ServiceName = aws_ecs_service.app.name
  }

  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "aurora_cpu" {
  alarm_name          = "${local.app_name}-aurora-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Aurora writer CPU too high"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    DBInstanceIdentifier = aws_rds_cluster_instance.writer.id
  }

  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "aurora_connections" {
  alarm_name          = "${local.app_name}-aurora-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = 200
  alarm_description   = "Aurora connection count high"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    DBInstanceIdentifier = aws_rds_cluster_instance.writer.id
  }

  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "aurora_storage" {
  alarm_name          = "${local.app_name}-aurora-free-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  metric_name         = "FreeLocalStorage"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 2147483648
  alarm_description   = "Aurora free local storage low"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    DBInstanceIdentifier = aws_rds_cluster_instance.writer.id
  }

  tags = local.tags
}

resource "aws_cloudwatch_dashboard" "ops" {
  dashboard_name = "${local.app_name}-ops"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "ALB 5xx + Target Response Time"
          region  = var.region
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.app.arn_suffix, "TargetGroup", aws_lb_target_group.app.arn_suffix],
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.app.arn_suffix, "TargetGroup", aws_lb_target_group.app.arn_suffix, { stat = "p95" }]
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "ECS CPU/Memory"
          region  = var.region
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", aws_ecs_service.app.name],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", aws_ecs_service.app.name]
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Aurora CPU + Connections"
          region  = var.region
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_rds_cluster_instance.writer.id],
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", aws_rds_cluster_instance.writer.id]
          ]
        }
      },
      {
        type   = "text"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          markdown = "# Travel AI Ops\nUse API /v1/analytics/funnel for business conversion metrics.\nThis dashboard focuses on runtime reliability."
        }
      }
    ]
  })
}

