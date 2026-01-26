"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Observability = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const cloudwatch_actions = __importStar(require("aws-cdk-lib/aws-cloudwatch-actions"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const subscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const constructs_1 = require("constructs");
class Observability extends constructs_1.Construct {
    alertTopic;
    dashboard;
    constructor(scope, id, props) {
        super(scope, id);
        // SNS Topic para alertas
        this.alertTopic = new sns.Topic(this, 'AlertTopic', {
            topicName: 't3ck-alerts',
            displayName: 'T3CK Platform Alerts',
        });
        // Subscrições de email
        if (props?.alertEmail) {
            this.alertTopic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
        }
        // Subscrição Slack (se configurado)
        if (props?.alertSlackWebhook) {
            // Nota: Para Slack, você precisaria criar uma Lambda function
            // que converte SNS para Slack webhook
        }
        // CloudWatch Dashboard
        this.dashboard = new cloudwatch.Dashboard(this, 'T3CKDashboard', {
            dashboardName: 'T3CK-Platform',
        });
        // Métricas de uptime
        const uptimeMetric = new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'HealthyHostCount',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
        });
        // Métricas de erros 5xx
        const error5xxMetric = new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'HTTPCode_Target_5XX_Count',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
        });
        // Métricas de tempo de resposta
        const responseTimeMetric = new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'TargetResponseTime',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
        });
        // Adicionar widgets ao dashboard
        this.dashboard.addWidgets(new cloudwatch.GraphWidget({
            title: 'Uptime',
            left: [uptimeMetric],
            width: 12,
        }), new cloudwatch.GraphWidget({
            title: '5xx Errors',
            left: [error5xxMetric],
            width: 12,
        }), new cloudwatch.GraphWidget({
            title: 'Response Time',
            left: [responseTimeMetric],
            width: 12,
        }));
        // Alarmes
        const errorAlarm = new cloudwatch.Alarm(this, 'Error5xxAlarm', {
            metric: error5xxMetric,
            threshold: 10,
            evaluationPeriods: 1,
            alarmDescription: 'API 5xx errors exceeded threshold',
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        const responseTimeAlarm = new cloudwatch.Alarm(this, 'ResponseTimeAlarm', {
            metric: responseTimeMetric,
            threshold: 2000, // 2 segundos
            evaluationPeriods: 2,
            alarmDescription: 'Response time exceeded threshold',
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Adicionar ações aos alarmes
        errorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alertTopic));
        responseTimeAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alertTopic));
        // Log Groups
        const authLogGroup = new logs.LogGroup(this, 'AuthLogGroup', {
            logGroupName: '/ecs/auth-service',
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        const webhookLogGroup = new logs.LogGroup(this, 'WebhookLogGroup', {
            logGroupName: '/ecs/webhook-service',
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        const tenantLogGroup = new logs.LogGroup(this, 'TenantLogGroup', {
            logGroupName: '/ecs/tenant-service',
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
    }
}
exports.Observability = Observability;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JzZXJ2YWJpbGl0eS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm9ic2VydmFiaWxpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCx1RkFBeUU7QUFDekUseURBQTJDO0FBQzNDLGlGQUFtRTtBQUNuRSwyREFBNkM7QUFDN0MsMkNBQXVDO0FBT3ZDLE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBQzFCLFVBQVUsQ0FBWTtJQUN0QixTQUFTLENBQXVCO0lBRWhELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBMEI7UUFDbEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQix5QkFBeUI7UUFDekIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNsRCxTQUFTLEVBQUUsYUFBYTtZQUN4QixXQUFXLEVBQUUsc0JBQXNCO1NBQ3BDLENBQUMsQ0FBQztRQUVILHVCQUF1QjtRQUN2QixJQUFJLEtBQUssRUFBRSxVQUFVLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsVUFBVSxDQUFDLGVBQWUsQ0FDN0IsSUFBSSxhQUFhLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUN0RCxDQUFDO1FBQ0osQ0FBQztRQUVELG9DQUFvQztRQUNwQyxJQUFJLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxDQUFDO1lBQzdCLDhEQUE4RDtZQUM5RCxzQ0FBc0M7UUFDeEMsQ0FBQztRQUVELHVCQUF1QjtRQUN2QixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksVUFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQy9ELGFBQWEsRUFBRSxlQUFlO1NBQy9CLENBQUMsQ0FBQztRQUVILHFCQUFxQjtRQUNyQixNQUFN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O1FBRUgsTUFBTSxlQUFlLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUNqRSxZQUFZLEVBQUUsc0JBQXNCO1lBQ3BDLFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVE7WUFDdEMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztTQUN6QyxDQUFDLENBQUM7UUFFSCxNQUFNLGNBQWMsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQy9ELFlBQVksRUFBRSxxQkFBcUI7WUFDbkMsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUTtZQUN0QyxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1NBQ3pDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXRIRCxzQ0FzSEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcclxuaW1wb3J0ICogYXMgY2xvdWR3YXRjaF9hY3Rpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoLWFjdGlvbnMnO1xyXG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XHJcbmltcG9ydCAqIGFzIHN1YnNjcmlwdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucy1zdWJzY3JpcHRpb25zJztcclxuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBPYnNlcnZhYmlsaXR5UHJvcHMge1xyXG4gIGFsZXJ0RW1haWw/OiBzdHJpbmc7XHJcbiAgYWxlcnRTbGFja1dlYmhvb2s/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBPYnNlcnZhYmlsaXR5IGV4dGVuZHMgQ29uc3RydWN0IHtcclxuICBwdWJsaWMgcmVhZG9ubHkgYWxlcnRUb3BpYzogc25zLlRvcGljO1xyXG4gIHB1YmxpYyByZWFkb25seSBkYXNoYm9hcmQ6IGNsb3Vkd2F0Y2guRGFzaGJvYXJkO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IE9ic2VydmFiaWxpdHlQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcclxuXHJcbiAgICAvLyBTTlMgVG9waWMgcGFyYSBhbGVydGFzXHJcbiAgICB0aGlzLmFsZXJ0VG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdBbGVydFRvcGljJywge1xyXG4gICAgICB0b3BpY05hbWU6ICd0M2NrLWFsZXJ0cycsXHJcbiAgICAgIGRpc3BsYXlOYW1lOiAnVDNDSyBQbGF0Zm9ybSBBbGVydHMnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gU3Vic2NyacOnw7VlcyBkZSBlbWFpbFxyXG4gICAgaWYgKHByb3BzPy5hbGVydEVtYWlsKSB7XHJcbiAgICAgIHRoaXMuYWxlcnRUb3BpYy5hZGRTdWJzY3JpcHRpb24oXHJcbiAgICAgICAgbmV3IHN1YnNjcmlwdGlvbnMuRW1haWxTdWJzY3JpcHRpb24ocHJvcHMuYWxlcnRFbWFpbClcclxuICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTdWJzY3Jpw6fDo28gU2xhY2sgKHNlIGNvbmZpZ3VyYWRvKVxyXG4gICAgaWYgKHByb3BzPy5hbGVydFNsYWNrV2ViaG9vaykge1xyXG4gICAgICAvLyBOb3RhOiBQYXJhIFNsYWNrLCB2b2PDqiBwcmVjaXNhcmlhIGNyaWFyIHVtYSBMYW1iZGEgZnVuY3Rpb25cclxuICAgICAgLy8gcXVlIGNvbnZlcnRlIFNOUyBwYXJhIFNsYWNrIHdlYmhvb2tcclxuICAgIH1cclxuXHJcbiAgICAvLyBDbG91ZFdhdGNoIERhc2hib2FyZFxyXG4gICAgdGhpcy5kYXNoYm9hcmQgPSBuZXcgY2xvdWR3YXRjaC5EYXNoYm9hcmQodGhpcywgJ1QzQ0tEYXNoYm9hcmQnLCB7XHJcbiAgICAgIGRhc2hib2FyZE5hbWU6ICdUM0NLLVBsYXRmb3JtJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE3DqXRyaWNhcyBkZSB1cHRpbWVcclxuICAgIGNvbnN0IHVwdGltZU1ldHJpYyA9IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XHJcbiAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcHBsaWNhdGlvbkVMQicsXHJcbiAgICAgIG1ldHJpY05hbWU6ICdIZWFsdGh5SG9zdENvdW50JyxcclxuICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXHJcbiAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBNw6l0cmljYXMgZGUgZXJyb3MgNXh4XHJcbiAgICBjb25zdCBlcnJvcjV4eE1ldHJpYyA9IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XHJcbiAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcHBsaWNhdGlvbkVMQicsXHJcbiAgICAgIG1ldHJpY05hbWU6ICdIVFRQQ29kZV9UYXJnZXRfNVhYX0NvdW50JyxcclxuICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE3DqXRyaWNhcyBkZSB0ZW1wbyBkZSByZXNwb3N0YVxyXG4gICAgY29uc3QgcmVzcG9uc2VUaW1lTWV0cmljID0gbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcclxuICAgICAgbmFtZXNwYWNlOiAnQVdTL0FwcGxpY2F0aW9uRUxCJyxcclxuICAgICAgbWV0cmljTmFtZTogJ1RhcmdldFJlc3BvbnNlVGltZScsXHJcbiAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxyXG4gICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRpY2lvbmFyIHdpZGdldHMgYW8gZGFzaGJvYXJkXHJcbiAgICB0aGlzLmRhc2hib2FyZC5hZGRXaWRnZXRzKFxyXG4gICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XHJcbiAgICAgICAgdGl0bGU6ICdVcHRpbWUnLFxyXG4gICAgICAgIGxlZnQ6IFt1cHRpbWVNZXRyaWNdLFxyXG4gICAgICAgIHdpZHRoOiAxMixcclxuICAgICAgfSksXHJcbiAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcclxuICAgICAgICB0aXRsZTogJzV4eCBFcnJvcnMnLFxyXG4gICAgICAgIGxlZnQ6IFtlcnJvcjV4eE1ldHJpY10sXHJcbiAgICAgICAgd2lkdGg6IDEyLFxyXG4gICAgICB9KSxcclxuICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xyXG4gICAgICAgIHRpdGxlOiAnUmVzcG9uc2UgVGltZScsXHJcbiAgICAgICAgbGVmdDogW3Jlc3BvbnNlVGltZU1ldHJpY10sXHJcbiAgICAgICAgd2lkdGg6IDEyLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBBbGFybWVzXHJcbiAgICBjb25zdCBlcnJvckFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0Vycm9yNXh4QWxhcm0nLCB7XHJcbiAgICAgIG1ldHJpYzogZXJyb3I1eHhNZXRyaWMsXHJcbiAgICAgIHRocmVzaG9sZDogMTAsXHJcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxyXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQVBJIDV4eCBlcnJvcnMgZXhjZWVkZWQgdGhyZXNob2xkJyxcclxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCByZXNwb25zZVRpbWVBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdSZXNwb25zZVRpbWVBbGFybScsIHtcclxuICAgICAgbWV0cmljOiByZXNwb25zZVRpbWVNZXRyaWMsXHJcbiAgICAgIHRocmVzaG9sZDogMjAwMCwgLy8gMiBzZWd1bmRvc1xyXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcclxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ1Jlc3BvbnNlIHRpbWUgZXhjZWVkZWQgdGhyZXNob2xkJyxcclxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGljaW9uYXIgYcOnw7VlcyBhb3MgYWxhcm1lc1xyXG4gICAgZXJyb3JBbGFybS5hZGRBbGFybUFjdGlvbihcclxuICAgICAgbmV3IGNsb3Vkd2F0Y2hfYWN0aW9ucy5TbnNBY3Rpb24odGhpcy5hbGVydFRvcGljKVxyXG4gICAgKTtcclxuICAgIHJlc3BvbnNlVGltZUFsYXJtLmFkZEFsYXJtQWN0aW9uKFxyXG4gICAgICBuZXcgY2xvdWR3YXRjaF9hY3Rpb25zLlNuc0FjdGlvbih0aGlzLmFsZXJ0VG9waWMpXHJcbiAgICApO1xyXG5cclxuICAgIC8vIExvZyBHcm91cHNcclxuICAgIGNvbnN0IGF1dGhMb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdBdXRoTG9nR3JvdXAnLCB7XHJcbiAgICAgIGxvZ0dyb3VwTmFtZTogJy9lY3MvYXV0aC1zZXJ2aWNlJyxcclxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCB3ZWJob29rTG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnV2ViaG9va0xvZ0dyb3VwJywge1xyXG4gICAgICBsb2dHcm91cE5hbWU6ICcvZWNzL3dlYmhvb2stc2VydmljZScsXHJcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgdGVuYW50TG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnVGVuYW50TG9nR3JvdXAnLCB7XHJcbiAgICAgIGxvZ0dyb3VwTmFtZTogJy9lY3MvdGVuYW50LXNlcnZpY2UnLFxyXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=