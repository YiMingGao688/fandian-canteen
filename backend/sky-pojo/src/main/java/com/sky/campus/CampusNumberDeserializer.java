package com.sky.campus;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import java.io.IOException;

/** 菜品维护请求拒绝小数自动截断，避免 1.9 份库存、分类主键或状态被静默改写为 1。 */
public final class CampusNumberDeserializer {
    private CampusNumberDeserializer() { }

    public static class IntValue extends JsonDeserializer<Integer> {
        /** 只接受 JSON 整数，范围溢出也由 Jackson 作为请求格式错误返回。 */
        @Override public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (parser.currentToken() != JsonToken.VALUE_NUMBER_INT) throw InvalidFormatException.from(parser, "请输入整数", parser.getText(), Integer.class);
            return parser.getIntValue();
        }
    }

    public static class LongValue extends JsonDeserializer<Long> {
        /** 主键不接受小数或字符串，权限校验始终使用客户端明确选择的完整整数。 */
        @Override public Long deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (parser.currentToken() != JsonToken.VALUE_NUMBER_INT) throw InvalidFormatException.from(parser, "请选择有效主键", parser.getText(), Long.class);
            return parser.getLongValue();
        }
    }
}
