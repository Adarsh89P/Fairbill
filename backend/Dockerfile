# ---- build ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B -DskipTests package

# ---- run ----
FROM eclipse-temurin:21-jre
# Tesseract is the default local OCR engine (eng + orientation detection).
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-osd \
 && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 10001 fairbill
USER fairbill
WORKDIR /app
COPY --from=build /src/target/fairbill-backend-*.jar app.jar
EXPOSE 8080
# Small heap & serial GC so the API fits free 512 MB instances (Tesseract runs outside the heap).
ENV JAVA_OPTS="-XX:MaxRAMPercentage=55 -XX:+UseSerialGC -Xss512k -XX:ReservedCodeCacheSize=64m -XX:MaxMetaspaceSize=160m -XX:TieredStopAtLevel=1 -Djava.awt.headless=true"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
